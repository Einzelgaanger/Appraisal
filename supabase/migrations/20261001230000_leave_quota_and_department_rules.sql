-- 10 calendar days per quarter, one person per department at a time,
-- HR (company_admin or platform admin) approves or declines.
-- Also expose department + photo on the company directory for profile teammates.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS department text;

CREATE OR REPLACE FUNCTION public.workspace_quarter_start(_d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT make_date(
    EXTRACT(YEAR FROM _d)::int,
    ((EXTRACT(MONTH FROM _d)::int - 1) / 3) * 3 + 1,
    1
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_date_overlap_days(a1 date, a2 date, b1 date, b2 date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, (LEAST(a2, b2) - GREATEST(a1, b1)) + 1);
$$;

CREATE OR REPLACE FUNCTION public.workspace_leave_used_in_range(
  _employee_id uuid,
  _from date,
  _to date,
  _exclude_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(SUM(
    public.workspace_date_overlap_days(r.start_date, r.end_date, _from, _to)
  ), 0)::int
  FROM public.workspace_leave_requests r
  WHERE r.employee_id = _employee_id
    AND r.status IN ('pending', 'approved')
    AND (_exclude_id IS NULL OR r.id <> _exclude_id)
    AND r.start_date <= _to
    AND r.end_date >= _from
$$;

CREATE OR REPLACE FUNCTION public.workspace_is_hr()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    (SELECT e.company_admin FROM public.employees e WHERE e.id = public.current_employee_id()),
    false
  ) OR public.has_role(auth.uid(), 'admin')
$$;

CREATE OR REPLACE FUNCTION public.workspace_assert_leave_ok(
  _employee_id uuid,
  _subsidiary_id uuid,
  _start date,
  _end date,
  _exclude_id uuid DEFAULT NULL
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
  overlap int;
  used int;
  allowance int := 10;
  period text;
BEGIN
  IF _end < _start THEN
    RAISE EXCEPTION 'End date must be on or after the start date.';
  END IF;

  SELECT e.department INTO emp_dept
  FROM public.employees e
  WHERE e.id = _employee_id;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_leave_requests r
    WHERE r.employee_id = _employee_id
      AND r.status IN ('pending', 'approved')
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
    AND r.status IN ('pending', 'approved')
    AND r.employee_id <> _employee_id
    AND (_exclude_id IS NULL OR r.id <> _exclude_id)
    AND r.start_date <= _end
    AND r.end_date >= _start
    AND lower(btrim(COALESCE(e.department, ''))) = lower(btrim(COALESCE(emp_dept, '')))
  LIMIT 1;

  IF conflict_name IS NOT NULL THEN
    RAISE EXCEPTION 'Someone in your department is already booked for those dates (%). Pick different dates.', conflict_name;
  END IF;

  q := public.workspace_quarter_start(_start);
  WHILE q <= _end LOOP
    q_end := (q + interval '3 months' - interval '1 day')::date;
    overlap := public.workspace_date_overlap_days(_start, _end, q, q_end);
    used := public.workspace_leave_used_in_range(_employee_id, q, q_end, _exclude_id);
    period := EXTRACT(YEAR FROM q)::int::text
      || '-Q'
      || (((EXTRACT(MONTH FROM q)::int - 1) / 3) + 1)::text;
    IF used + overlap > allowance THEN
      RAISE EXCEPTION 'This leave would use % days in %, but you only have % of 10 remaining.',
        overlap, period, GREATEST(0, allowance - used);
    END IF;
    q := (q + interval '3 months')::date;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_my_leave_balance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  d date := CURRENT_DATE;
  q_start date := public.workspace_quarter_start(d);
  q_end date := (q_start + interval '3 months' - interval '1 day')::date;
  used int := 0;
  my_dept text;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object(
      'period', EXTRACT(YEAR FROM q_start)::int::text || '-Q' || (((EXTRACT(MONTH FROM q_start)::int - 1) / 3) + 1)::text,
      'allowance', 10,
      'used', 0,
      'remaining', 10,
      'department', NULL,
      'is_hr', false,
      'quarter_start', q_start,
      'quarter_end', q_end
    );
  END IF;

  SELECT e.department INTO my_dept FROM public.employees e WHERE e.id = me;
  used := public.workspace_leave_used_in_range(me, q_start, q_end, NULL);

  RETURN jsonb_build_object(
    'period', EXTRACT(YEAR FROM q_start)::int::text || '-Q' || (((EXTRACT(MONTH FROM q_start)::int - 1) / 3) + 1)::text,
    'allowance', 10,
    'used', used,
    'remaining', GREATEST(0, 10 - used),
    'department', my_dept,
    'is_hr', public.workspace_is_hr(),
    'quarter_start', q_start,
    'quarter_end', q_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_list_leave()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'employee_id', r.employee_id,
    'employee_name', e.name,
    'department', e.department,
    'leave_type', r.leave_type,
    'start_date', r.start_date,
    'end_date', r.end_date,
    'day_count', (r.end_date - r.start_date) + 1,
    'status', r.status,
    'note', r.note,
    'created_at', r.created_at,
    'decided_by', r.decided_by
  ) ORDER BY r.start_date, e.name), '[]'::jsonb)
  FROM public.workspace_leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  WHERE r.subsidiary_id = public.workspace_my_subsidiary_id()
    AND r.status <> 'cancelled';
$$;

CREATE OR REPLACE FUNCTION public.workspace_request_leave(
  _leave_type text,
  _start_date date,
  _end_date date,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
  rid uuid;
  reason text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF _leave_type IS NULL OR _leave_type NOT IN ('annual', 'sick', 'unpaid', 'parental', 'compassionate', 'other') THEN
    RAISE EXCEPTION 'Choose a leave type.';
  END IF;
  IF reason IS NULL OR char_length(reason) < 8 THEN
    RAISE EXCEPTION 'Add a short reason for this leave request.';
  END IF;

  PERFORM public.workspace_assert_leave_ok(me, sid, _start_date, _end_date, NULL);

  INSERT INTO public.workspace_leave_requests (
    subsidiary_id, employee_id, leave_type, start_date, end_date, note, status
  ) VALUES (
    sid, me, _leave_type, _start_date, _end_date, reason, 'pending'
  )
  RETURNING id INTO rid;
  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_decide_leave(_request_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  row_emp uuid;
  row_sid uuid;
  row_start date;
  row_end date;
BEGIN
  IF NOT public.workspace_is_hr() THEN
    RAISE EXCEPTION 'Only HR can approve or decline leave.';
  END IF;

  SELECT r.employee_id, r.subsidiary_id, r.start_date, r.end_date
    INTO row_emp, row_sid, row_start, row_end
  FROM public.workspace_leave_requests r
  WHERE r.id = _request_id
    AND r.subsidiary_id = public.workspace_my_subsidiary_id()
    AND r.status = 'pending';

  IF row_emp IS NULL THEN
    RAISE EXCEPTION 'No pending leave request to decide.';
  END IF;

  IF _approve THEN
    PERFORM public.workspace_assert_leave_ok(row_emp, row_sid, row_start, row_end, _request_id);
  END IF;

  UPDATE public.workspace_leave_requests
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'declined' END,
      decided_by = me,
      decided_at = now(),
      updated_at = now()
  WHERE id = _request_id
    AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_company_directory()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'role', e.role,
    'email', e.email,
    'department', e.department,
    'avatar_url', e.avatar_url
  ) ORDER BY e.name), '[]'::jsonb)
  FROM public.employees e
  WHERE e.subsidiary_id = public.workspace_my_subsidiary_id()
    AND e.id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_quarter_start(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_date_overlap_days(date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_leave_used_in_range(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_is_hr() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_assert_leave_ok(uuid, uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_my_leave_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_list_leave() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_request_leave(text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_decide_leave(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_company_directory() TO authenticated;
