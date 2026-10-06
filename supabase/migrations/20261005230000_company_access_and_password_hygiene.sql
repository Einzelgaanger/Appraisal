-- Close the public roster, and only allow a login to act as the same person.
--
-- Anonymous visitors could read every employee, subsidiary, and survey row.
-- Company membership is now the read boundary. Account search goes through a
-- narrow function instead of downloading the directory.
--
-- A second company is allowed only when both roster rows share a person id.
-- That id follows the mailbox name (so ayomide.adeosun and adeosun.ayomide
-- are one person) and is never taken from the display name.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity. Sorted mailbox tokens, not the person's display name.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.employee_person_key(_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF((
    SELECT string_agg(token, '.' ORDER BY token)
    FROM unnest(string_to_array(
      regexp_replace(lower(split_part(coalesce(_email, ''), '@', 1)), '[^a-z0-9]+', '.', 'g'),
      '.'
    )) AS token
    WHERE token <> ''
  ), '');
$$;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS person_id uuid;

UPDATE public.employees e
SET person_id = grouped.person_id
FROM (
  SELECT public.employee_person_key(email) AS person_key,
         gen_random_uuid() AS person_id
  FROM public.employees
  WHERE public.employee_person_key(email) IS NOT NULL
  GROUP BY 1
) grouped
WHERE public.employee_person_key(e.email) = grouped.person_key
  AND e.person_id IS NULL;

UPDATE public.employees
SET person_id = gen_random_uuid()
WHERE person_id IS NULL;

ALTER TABLE public.employees
  ALTER COLUMN person_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS employees_person_id_idx ON public.employees (person_id);

CREATE OR REPLACE FUNCTION public.employees_assign_person_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  existing uuid;
BEGIN
  IF NEW.person_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.person_id
    INTO existing
  FROM public.employees e
  WHERE public.employee_person_key(e.email) IS NOT NULL
    AND public.employee_person_key(e.email) = public.employee_person_key(NEW.email)
  LIMIT 1;

  NEW.person_id := coalesce(existing, gen_random_uuid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_assign_person_id ON public.employees;
CREATE TRIGGER employees_assign_person_id
  BEFORE INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.employees_assign_person_id();

CREATE OR REPLACE FUNCTION public.employees_lock_person_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.person_id IS DISTINCT FROM OLD.person_id
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('app.allow_person_link', true), '') <> 'on' THEN
    NEW.person_id := OLD.person_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_lock_person_id ON public.employees;
CREATE TRIGGER employees_lock_person_id
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.employees_lock_person_id();

-- An administrator links two roster rows that do not share a mailbox name.
CREATE OR REPLACE FUNCTION public.link_same_person(_employee_a uuid, _employee_b uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  kept uuid;
  other uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT person_id INTO kept FROM public.employees WHERE id = _employee_a;
  SELECT person_id INTO other FROM public.employees WHERE id = _employee_b;
  IF kept IS NULL OR other IS NULL THEN
    RAISE EXCEPTION 'Both people must already be on the roster';
  END IF;

  PERFORM set_config('app.allow_person_link', 'on', true);
  UPDATE public.employees
  SET person_id = kept
  WHERE person_id = other;
END;
$$;

REVOKE ALL ON FUNCTION public.link_same_person(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_same_person(uuid, uuid) TO authenticated;

-- Drop grants whose two seats are different people.
DELETE FROM public.employee_access a
USING public.profiles pr
JOIN public.employees own ON own.id = coalesce(
  pr.employee_id,
  (
    SELECT e.id
    FROM public.employees e
    WHERE lower(e.email) = lower(pr.email)
    ORDER BY e.created_at
    LIMIT 1
  )
)
JOIN public.employees seat ON true
WHERE a.profile_id = pr.id
  AND a.employee_id = seat.id
  AND own.person_id IS DISTINCT FROM seat.person_id;

CREATE OR REPLACE FUNCTION public.employee_access_same_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  own_person uuid;
  seat_person uuid;
BEGIN
  SELECT e.person_id
    INTO own_person
  FROM public.profiles pr
  JOIN public.employees e ON e.id = coalesce(
    pr.employee_id,
    (
      SELECT match.id
      FROM public.employees match
      WHERE lower(match.email) = lower(pr.email)
      ORDER BY match.created_at
      LIMIT 1
    )
  )
  WHERE pr.id = NEW.profile_id;

  SELECT person_id INTO seat_person
  FROM public.employees
  WHERE id = NEW.employee_id;

  IF own_person IS NULL OR seat_person IS NULL OR own_person IS DISTINCT FROM seat_person THEN
    RAISE EXCEPTION 'A login can only act as the same person';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_access_same_person ON public.employee_access;
CREATE TRIGGER employee_access_same_person
  BEFORE INSERT OR UPDATE ON public.employee_access
  FOR EACH ROW
  EXECUTE FUNCTION public.employee_access_same_person();

-- ---------------------------------------------------------------------------
-- Who can see a company. Platform admins see every company. Everyone else
-- sees the companies their login was granted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.viewer_can_read_company(_subsidiary uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.employee_access a
      JOIN public.employees e ON e.id = a.employee_id
      WHERE a.profile_id = auth.uid()
        AND e.subsidiary_id = _subsidiary
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid()
        AND e.subsidiary_id = _subsidiary
    );
$$;

REVOKE ALL ON FUNCTION public.viewer_can_read_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.viewer_can_read_company(uuid) TO authenticated;

DROP POLICY IF EXISTS "Anyone can read employees" ON public.employees;
DROP POLICY IF EXISTS "Company members read employees" ON public.employees;
CREATE POLICY "Company members read employees"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    public.viewer_can_read_company(subsidiary_id)
    OR lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "Anyone can read subsidiaries" ON public.subsidiaries;
DROP POLICY IF EXISTS "Company members read subsidiaries" ON public.subsidiaries;
CREATE POLICY "Company members read subsidiaries"
  ON public.subsidiaries
  FOR SELECT
  TO authenticated
  USING (public.viewer_can_read_company(id));

DROP POLICY IF EXISTS "Anyone can read survey categories" ON public.survey_categories;
DROP POLICY IF EXISTS "Authenticated read survey categories" ON public.survey_categories;
CREATE POLICY "Authenticated read survey categories"
  ON public.survey_categories
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can read survey questions" ON public.survey_questions;
DROP POLICY IF EXISTS "Authenticated read survey questions" ON public.survey_questions;
CREATE POLICY "Authenticated read survey questions"
  ON public.survey_questions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert survey responses" ON public.survey_responses;
DROP POLICY IF EXISTS "Authenticated can read survey responses" ON public.survey_responses;
DROP POLICY IF EXISTS "Company members read survey responses" ON public.survey_responses;
DROP POLICY IF EXISTS "Company members insert survey responses" ON public.survey_responses;
DROP POLICY IF EXISTS "Company members delete survey responses" ON public.survey_responses;
CREATE POLICY "Company members read survey responses"
  ON public.survey_responses
  FOR SELECT
  TO authenticated
  USING (public.viewer_can_read_company(subsidiary_id));
CREATE POLICY "Company members insert survey responses"
  ON public.survey_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.viewer_can_read_company(subsidiary_id));
CREATE POLICY "Company members delete survey responses"
  ON public.survey_responses
  FOR DELETE
  TO authenticated
  USING (public.viewer_can_read_company(subsidiary_id));

DROP POLICY IF EXISTS "Anyone can insert survey answers" ON public.survey_answers;
DROP POLICY IF EXISTS "Authenticated can read survey answers" ON public.survey_answers;
DROP POLICY IF EXISTS "Company members read survey answers" ON public.survey_answers;
DROP POLICY IF EXISTS "Company members insert survey answers" ON public.survey_answers;
CREATE POLICY "Company members read survey answers"
  ON public.survey_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.survey_responses r
      WHERE r.id = response_id
        AND public.viewer_can_read_company(r.subsidiary_id)
    )
  );
CREATE POLICY "Company members insert survey answers"
  ON public.survey_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.survey_responses r
      WHERE r.id = response_id
        AND public.viewer_can_read_company(r.subsidiary_id)
    )
  );

REVOKE ALL ON public.employees FROM anon;
REVOKE ALL ON public.subsidiaries FROM anon;
REVOKE ALL ON public.survey_categories FROM anon;
REVOKE ALL ON public.survey_questions FROM anon;
REVOKE ALL ON public.survey_responses FROM anon;
REVOKE ALL ON public.survey_answers FROM anon;

-- Account recovery searches by name or email. It never returns the directory.
CREATE OR REPLACE FUNCTION public.find_account_candidates(_query text)
RETURNS TABLE (
  id uuid,
  name text,
  role text,
  email text,
  department text,
  company_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  q text := lower(btrim(coalesce(_query, '')));
BEGIN
  q := replace(replace(replace(q, '\', ''), '%', ''), '_', '');
  IF char_length(q) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.name, e.role, e.email, e.department, s.name
  FROM public.employees e
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  WHERE lower(e.name) LIKE '%' || q || '%'
     OR lower(coalesce(e.email, '')) LIKE '%' || q || '%'
  ORDER BY e.name
  LIMIT 12;
END;
$$;

REVOKE ALL ON FUNCTION public.find_account_candidates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_account_candidates(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared demo passwords may still sign in once. The app then requires a
-- personal password. Choosing a shared password again keeps the requirement.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.password_is_shared(_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
  SELECT _hash IS NOT NULL
    AND (
      _hash = crypt('GhcDemo2026!', _hash)
      OR _hash = crypt('BoomEoDemo2026!', _hash)
      OR _hash = crypt('VigiPayDemo2026!', _hash)
    );
$$;

REVOKE ALL ON FUNCTION public.password_is_shared(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.profiles_lock_password_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('app.allow_password_flag', true), '') <> 'on' THEN
    NEW.must_change_password := OLD.must_change_password;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_password_flag ON public.profiles;
CREATE TRIGGER profiles_lock_password_flag
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_lock_password_flag();

CREATE OR REPLACE FUNCTION public.sync_password_change_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.encrypted_password IS NOT DISTINCT FROM OLD.encrypted_password THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.allow_password_flag', 'on', true);
  UPDATE public.profiles
  SET must_change_password = public.password_is_shared(NEW.encrypted_password)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_password_change_requirement ON auth.users;
CREATE TRIGGER sync_password_change_requirement
  AFTER INSERT OR UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_password_change_requirement();
