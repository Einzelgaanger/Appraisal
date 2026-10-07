-- Greenhouse Capital roster change from the onboarding thread:
-- Anjolaoluwa Jawando has left, so she comes off the team and can no longer
-- sit in the 360 set or block a colleague's leave. Boluwatife Ajayi takes the
-- vacant Investment Intern seat under Mariam Adahunse.
-- The first-two-weeks and last-two-weeks leave blackout is not in force.
-- Annual leave can fall on any working day in the quarter. The week-2
-- submission deadline stays.

DO $$
DECLARE
  ghc uuid := '22222222-2222-2222-2222-222222222222';
  anjola uuid;
  mariam uuid;
  bolu uuid;
  seat uuid := 'a1111111-1111-4111-8111-111111111112';
BEGIN
  SELECT id INTO anjola
  FROM public.employees
  WHERE lower(email) = lower('anjolaoluwa.jawando@greenhouse.capital')
     OR (name ILIKE 'Anjolaoluwa Jawando%' AND subsidiary_id = ghc)
  ORDER BY CASE WHEN lower(email) = lower('anjolaoluwa.jawando@greenhouse.capital') THEN 0 ELSE 1 END
  LIMIT 1;

  IF anjola IS NOT NULL THEN
    UPDATE public.employees
    SET ghc_appraisal_active = false
    WHERE id = anjola;

    UPDATE public.employees
    SET ghc_manager_id = NULL
    WHERE ghc_manager_id = anjola;

    UPDATE public.employees
    SET ghc_secondary_manager_id = NULL
    WHERE ghc_secondary_manager_id = anjola;

    UPDATE public.employees
    SET manager_id = NULL
    WHERE manager_id = anjola
      AND subsidiary_id = ghc;

    UPDATE public.employees
    SET secondary_manager_id = NULL
    WHERE secondary_manager_id = anjola
      AND subsidiary_id = ghc;

    UPDATE public.workspace_leave_requests
    SET status = 'cancelled'
    WHERE employee_id = anjola
      AND status IN ('pending', 'hr_approved', 'manager_approved', 'approved');
  END IF;

  UPDATE auth.users
  SET banned_until = 'infinity'
  WHERE lower(email) = lower('anjolaoluwa.jawando@greenhouse.capital')
     OR id IN (
       SELECT p.id
       FROM public.profiles p
       WHERE anjola IS NOT NULL
         AND (p.employee_id = anjola OR p.active_employee_id = anjola)
     );

  SELECT id INTO mariam
  FROM public.employees
  WHERE lower(email) = lower('mariam.adahunse@greenhouse.capital')
  LIMIT 1;

  SELECT id INTO bolu
  FROM public.employees
  WHERE lower(email) = lower('boluwatife.ajayi@greenhouse.capital')
  LIMIT 1;

  IF bolu IS NULL AND EXISTS (SELECT 1 FROM public.employees WHERE id = seat) THEN
    bolu := seat;
  END IF;

  IF bolu IS NULL THEN
    INSERT INTO public.employees (
      id, subsidiary_id, name, email, role, department,
      hierarchy_level, ghc_hierarchy_level, ghc_appraisal_active,
      eo_appraisal_active, vigipay_appraisal_active,
      ghc_manager_id, manager_id
    ) VALUES (
      seat, ghc, 'Boluwatife Ajayi', 'boluwatife.ajayi@greenhouse.capital',
      'Investment Intern', 'Investment',
      5, 5, true,
      false, false,
      mariam, mariam
    );
  ELSE
    UPDATE public.employees
    SET
      subsidiary_id = ghc,
      name = 'Boluwatife Ajayi',
      email = 'boluwatife.ajayi@greenhouse.capital',
      role = 'Investment Intern',
      department = 'Investment',
      hierarchy_level = 5,
      ghc_hierarchy_level = 5,
      ghc_appraisal_active = true,
      eo_appraisal_active = false,
      vigipay_appraisal_active = false,
      ghc_manager_id = mariam,
      manager_id = mariam,
      ghc_secondary_manager_id = NULL,
      secondary_manager_id = NULL
    WHERE id = bolu;
  END IF;
END;
$$;

-- Company directory follows the live appraisal pool. A departed Greenhouse
-- or VigiPay person stays on file and drops out of the team list.
CREATE OR REPLACE FUNCTION public.workspace_company_directory()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  sid uuid := public.workspace_my_subsidiary_id();
  ghc uuid := '22222222-2222-2222-2222-222222222222';
  vigi uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'role', e.role,
      'additional_roles', COALESCE(e.additional_roles, '{}'::text[]),
      'email', e.email,
      'department', e.department,
      'additional_departments', COALESCE(e.additional_departments, '{}'::text[]),
      'avatar_url', e.avatar_url,
      'hierarchy_level', CASE
        WHEN sid IN (ghc, vigi) THEN COALESCE(e.ghc_hierarchy_level, e.hierarchy_level)
        ELSE e.hierarchy_level
      END,
      'manager_id', CASE
        WHEN sid IN (ghc, vigi) THEN COALESCE(e.ghc_manager_id, e.manager_id)
        ELSE e.manager_id
      END,
      'secondary_manager_id', CASE
        WHEN sid IN (ghc, vigi) THEN COALESCE(e.ghc_secondary_manager_id, e.secondary_manager_id)
        ELSE e.secondary_manager_id
      END
    ) ORDER BY COALESCE(e.ghc_hierarchy_level, e.hierarchy_level), e.name)
    FROM public.employees e
    WHERE e.name NOT ILIKE '%(vacant)%'
      AND (
        (sid = ghc AND public.ghc_member_pool(e.id) = 'ghc')
        OR (sid = vigi AND public.ghc_member_pool(e.id) = 'vigipay')
        OR (sid IS NOT NULL AND sid NOT IN (ghc, vigi) AND e.subsidiary_id = sid)
      )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_assert_leave_ok(
  _employee_id uuid,
  _subsidiary_id uuid,
  _start date,
  _end date,
  _exclude_id uuid DEFAULT NULL,
  _bypass_window boolean DEFAULT false,
  _leave_type text DEFAULT 'annual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  emp_dept text;
  conflict_name text;
  q date;
  q_end date;
  range_from date;
  range_to date;
  overlap int;
  used int;
  allowance int;
  period text;
  submit_deadline date;
  kind text := COALESCE(NULLIF(_leave_type, ''), 'annual');
  ghc uuid := '22222222-2222-2222-2222-222222222222';
  vigi uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  IF _end < _start THEN
    RAISE EXCEPTION 'End date must be on or after the start date.';
  END IF;
  IF public.workspace_working_days(_start, _end) < 1 THEN
    RAISE EXCEPTION 'Pick at least one working day (Monday to Friday).';
  END IF;

  q := public.workspace_quarter_start(_start);
  q_end := (q + interval '3 months' - interval '1 day')::date;
  submit_deadline := q + 13;
  allowance := public.workspace_leave_allowance(kind);

  IF kind = 'maternity' THEN
    range_from := date_trunc('year', _start)::date;
    range_to := (range_from + interval '1 year' - interval '1 day')::date;
  ELSE
    IF public.workspace_quarter_start(_end) <> q THEN
      RAISE EXCEPTION 'Keep this block inside one quarter. Split across quarters into separate requests.';
    END IF;
    range_from := q;
    range_to := q_end;
  END IF;

  IF kind = 'annual' THEN
    IF NOT _bypass_window AND CURRENT_DATE > submit_deadline THEN
      RAISE EXCEPTION 'Annual leave for this quarter had to be submitted by the end of week 2 (%). After that, HR reschedules remaining days around department conflicts.',
        submit_deadline;
    END IF;
  END IF;

  SELECT e.department INTO emp_dept
  FROM public.employees e
  WHERE e.id = _employee_id;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_leave_requests r
    WHERE r.employee_id = _employee_id
      AND r.status IN ('pending', 'hr_approved', 'manager_approved', 'approved')
      AND (_exclude_id IS NULL OR r.id <> _exclude_id)
      AND r.start_date <= _end
      AND r.end_date >= _start
  ) THEN
    RAISE EXCEPTION 'Those dates overlap leave already booked for this person.';
  END IF;

  SELECT e.name INTO conflict_name
  FROM public.workspace_leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  WHERE r.subsidiary_id = _subsidiary_id
    AND r.status IN ('pending', 'hr_approved', 'manager_approved', 'approved')
    AND r.employee_id <> _employee_id
    AND (_exclude_id IS NULL OR r.id <> _exclude_id)
    AND r.start_date <= _end
    AND r.end_date >= _start
    AND lower(btrim(COALESCE(e.department, ''))) = lower(btrim(COALESCE(emp_dept, '')))
    AND NOT (
      e.subsidiary_id IN (ghc, vigi)
      AND public.ghc_member_pool(e.id) IS NULL
    )
  LIMIT 1;

  IF conflict_name IS NOT NULL THEN
    RAISE EXCEPTION 'Someone in your department is already booked for those dates (%). Pick different dates.', conflict_name;
  END IF;

  overlap := public.workspace_working_days(_start, _end);
  used := public.workspace_leave_used_in_range(_employee_id, range_from, range_to, _exclude_id, kind);
  period := CASE
    WHEN kind = 'maternity' THEN EXTRACT(YEAR FROM range_from)::int::text
    ELSE EXTRACT(YEAR FROM q)::int::text || '-Q' || (((EXTRACT(MONTH FROM q)::int - 1) / 3) + 1)::text
  END;
  IF used + overlap > allowance THEN
    RAISE EXCEPTION '% leave allows % working days in %. This block uses % days, and % remain.',
      initcap(replace(kind, '_', ' ')), allowance, period, overlap, GREATEST(0, allowance - used);
  END IF;
END;
$$;

-- Keep whichever balance function is already installed, and open the whole quarter.
DO $patch$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'workspace_my_leave_balance'
  LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'workspace_my_leave_balance is missing';
  END IF;

  src := replace(src, 'q_start + 14', 'q_start');
  src := replace(src, 'q_end - 14', 'q_end');
  EXECUTE src;
END;
$patch$;

NOTIFY pgrst, 'reload schema';
