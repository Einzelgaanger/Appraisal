-- Multi-company access: one login, several roster rows, one active at a time.
--
-- Until now a login WAS a company. profiles held a single employee_id and
-- current_employee_id() resolved it with a LIMIT 1, so people who work across
-- companies needed a second account under a second email address. Three people
-- are in that position today (Bunmi Akinyemiju, Omotola Akinyemiju, Ayomide
-- Adeosun).
--
-- Every policy and RPC already resolves the caller through current_employee_id(),
-- so teaching that one function about an active selection moves the whole
-- application between companies without touching anything else.

-- ---------------------------------------------------------------------------
-- 1. Tie the tenant registry to the roster.
--
-- public.tenants and public.tenant_domains were already populated but nothing
-- read them, and they had drifted: GreenHouse Capital was recorded as 'boom'.
-- Linking a tenant to its subsidiary makes "which company is this employee in"
-- answerable in SQL instead of only in the frontend's hardcoded TENANTS array.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subsidiary_id uuid REFERENCES public.subsidiaries(id);

UPDATE public.tenants SET subsidiary_id = '11111111-1111-1111-1111-111111111111',
                          appraisal_mode = 'boom'    WHERE slug = 'executiveteam';
UPDATE public.tenants SET subsidiary_id = '22222222-2222-2222-2222-222222222222',
                          appraisal_mode = 'ghc'     WHERE slug = 'ghc';
UPDATE public.tenants SET subsidiary_id = '33333333-3333-3333-3333-333333333333',
                          appraisal_mode = 'vigipay' WHERE slug = 'vigipay';

CREATE UNIQUE INDEX IF NOT EXISTS tenants_subsidiary_id_key
  ON public.tenants (subsidiary_id) WHERE subsidiary_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Which roster rows may a given login act as.
--
-- Membership is curated, never inferred. The same person appears under different
-- email addresses in different companies, so matching on name or address would
-- be a guess — and a wrong guess hands someone another company's appraisals.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_access (
  profile_id  uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, employee_id)
);

CREATE INDEX IF NOT EXISTS employee_access_employee_id_idx
  ON public.employee_access (employee_id);

ALTER TABLE public.employee_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own company access" ON public.employee_access;
CREATE POLICY "read own company access" ON public.employee_access
  FOR SELECT USING (profile_id = auth.uid());

-- No insert/update/delete policy: grants are an administrative act, made by
-- migrations or service-role scripts, never by the client.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_employee_id uuid REFERENCES public.employees(id);

-- ---------------------------------------------------------------------------
-- 3. Backfill: everyone keeps exactly the access they have today.
-- ---------------------------------------------------------------------------

INSERT INTO public.employee_access (profile_id, employee_id)
SELECT p.id, p.employee_id
FROM public.profiles p
WHERE p.employee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Resolve the caller to their active company.
--
-- The active selection is honoured only when it appears in employee_access, so a
-- stale or tampered value cannot widen access. Falling back to profiles.employee_id
-- keeps every existing single-company login behaving exactly as before.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT p.active_employee_id
      FROM public.profiles p
      JOIN public.employee_access a
        ON a.profile_id = p.id
       AND a.employee_id = p.active_employee_id
      WHERE p.id = auth.uid()
    ),
    (
      SELECT p.employee_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.employee_id IS NOT NULL
    ),
    (
      SELECT e.id
      FROM public.employees e
      JOIN public.profiles p ON lower(p.email) = lower(e.email)
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );
$function$;

-- ---------------------------------------------------------------------------
-- 5. What the frontend needs: where do I belong, and switch me.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_companies()
RETURNS TABLE (
  employee_id   uuid,
  tenant_slug   text,
  company_name  text,
  employee_role text,
  is_active     boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id,
         t.slug,
         s.name,
         e.role,
         e.id = public.current_employee_id()
  FROM public.employee_access a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  LEFT JOIN public.tenants t ON t.subsidiary_id = e.subsidiary_id
  WHERE a.profile_id = auth.uid()
  ORDER BY s.name;
$function$;

CREATE OR REPLACE FUNCTION public.set_active_company(_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _slug text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employee_access
    WHERE profile_id = auth.uid() AND employee_id = _employee_id
  ) THEN
    RAISE EXCEPTION 'You do not have access to that company';
  END IF;

  UPDATE public.profiles
  SET active_employee_id = _employee_id
  WHERE id = auth.uid();

  SELECT t.slug INTO _slug
  FROM public.employees e
  LEFT JOIN public.tenants t ON t.subsidiary_id = e.subsidiary_id
  WHERE e.id = _employee_id;

  RETURN _slug;
END;
$function$;

REVOKE ALL ON FUNCTION public.my_companies() FROM public;
REVOKE ALL ON FUNCTION public.set_active_company(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.my_companies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_company(uuid) TO authenticated;
