-- A login may act as the same person in another company.
-- It must not act as a different person. Omotola's GHC login had been
-- granted Bunmi and Ayomide, so Executive Office was not her own seat.
-- Opening a company she belongs to should keep that company, not the previous one.

DELETE FROM public.employee_access a
USING auth.users u, public.employees e
WHERE a.profile_id = u.id
  AND a.employee_id = e.id
  AND lower(u.email) = 'omotola.akinyemiju@greenhouse.capital'
  AND e.name NOT ILIKE 'Omotola Akinyemiju%';

DELETE FROM public.employee_access a
USING auth.users u, public.employees e
WHERE a.profile_id = u.id
  AND a.employee_id = e.id
  AND lower(u.email) IN (
    'ayomide.adeosun@venturegardengroup.com',
    'adeosun.ayomide@venturegardengroup.com'
  )
  AND e.name ILIKE 'Omotola Akinyemiju%';

INSERT INTO public.employee_access (profile_id, employee_id)
SELECT u.id, e.id
FROM auth.users u
JOIN public.employees e ON e.name ILIKE 'Omotola Akinyemiju%'
WHERE lower(u.email) IN (
  'omotola.akinyemiju@greenhouse.capital',
  'omotola.akinyemiju@venturegardengroup.com'
)
ON CONFLICT DO NOTHING;

DROP FUNCTION IF EXISTS public.my_companies();

CREATE FUNCTION public.my_companies()
RETURNS TABLE (
  employee_id   uuid,
  tenant_slug   text,
  company_name  text,
  employee_role text,
  is_active     boolean,
  employee_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id,
         t.slug,
         s.name,
         e.role,
         e.id = public.current_employee_id(),
         e.name
  FROM public.employee_access a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  LEFT JOIN public.tenants t ON t.subsidiary_id = e.subsidiary_id
  WHERE a.profile_id = auth.uid()
  ORDER BY s.name, e.name;
$function$;

REVOKE ALL ON FUNCTION public.my_companies() FROM public;
GRANT EXECUTE ON FUNCTION public.my_companies() TO authenticated;
