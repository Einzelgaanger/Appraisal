-- A login may sit on the same person in another company.
-- It must not sit on a different person. Ayomide's VigiPay login could
-- open Bunmi's Executive Office and GHC seats, which is the same mix-up
-- that sent Omotola back to the wrong dashboard.

DELETE FROM public.employee_access a
WHERE EXISTS (
  SELECT 1
  FROM public.profiles pr
  LEFT JOIN public.employees own ON own.id = pr.employee_id
  JOIN public.employees seat ON seat.id = a.employee_id
  WHERE pr.id = a.profile_id
    AND coalesce(own.name, pr.name, '') <> ''
    AND lower(regexp_replace(seat.name, '[^a-zA-Z]+', '', 'g'))
        <> lower(regexp_replace(coalesce(own.name, pr.name), '[^a-zA-Z]+', '', 'g'))
);

UPDATE public.profiles p
SET active_employee_id = NULL
WHERE p.active_employee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.employee_access a
    WHERE a.profile_id = p.id
      AND a.employee_id = p.active_employee_id
  );

CREATE OR REPLACE FUNCTION public.employee_access_same_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  own_name text;
  seat_name text;
BEGIN
  SELECT lower(regexp_replace(coalesce(own.name, pr.name, ''), '[^a-zA-Z]+', '', 'g'))
    INTO own_name
  FROM public.profiles pr
  LEFT JOIN public.employees own ON own.id = pr.employee_id
  WHERE pr.id = NEW.profile_id;

  SELECT lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z]+', '', 'g'))
    INTO seat_name
  FROM public.employees
  WHERE id = NEW.employee_id;

  IF coalesce(own_name, '') <> ''
     AND coalesce(seat_name, '') <> ''
     AND own_name IS DISTINCT FROM seat_name THEN
    RAISE EXCEPTION 'A login can only act as the same person';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS employee_access_same_person ON public.employee_access;

CREATE TRIGGER employee_access_same_person
  BEFORE INSERT OR UPDATE ON public.employee_access
  FOR EACH ROW
  EXECUTE FUNCTION public.employee_access_same_person();
