-- GHC leave planner flow:
-- 10 working days/quarter, split into blocks, no leave in first/last 2 weeks,
-- requests in by the end of week 2, line manager then HR, one person per department at a time.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_leave_requests'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%leave_type%'
        OR pg_get_constraintdef(oid) ILIKE '%status%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.workspace_leave_requests DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.workspace_leave_requests
  ADD CONSTRAINT workspace_leave_type_check CHECK (
    leave_type IN (
      'annual', 'compassionate', 'maternity', 'study',
      'sick', 'unpaid', 'parental', 'other'
    )
  );

ALTER TABLE public.workspace_leave_requests
  ADD CONSTRAINT workspace_leave_status_check CHECK (
    status IN ('pending', 'manager_approved', 'approved', 'declined', 'cancelled')
  );

ALTER TABLE public.workspace_leave_requests
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_leave_requests
  ADD COLUMN IF NOT EXISTS manager_decided_at timestamptz;

CREATE OR REPLACE FUNCTION public.workspace_working_days(_start date, _end date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _start IS NULL OR _end IS NULL OR _end < _start THEN 0
    ELSE (
      SELECT COUNT(*)::int
      FROM generate_series(_start, _end, interval '1 day') d
      WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_working_days_overlap(a1 date, a2 date, b1 date, b2 date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.workspace_working_days(GREATEST(a1, b1), LEAST(a2, b2));
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
    public.workspace_working_days_overlap(r.start_date, r.end_date, _from, _to)
  ), 0)::int
  FROM public.workspace_leave_requests r
  WHERE r.employee_id = _employee_id
    AND r.status IN ('pending', 'manager_approved', 'approved')
    AND (_exclude_id IS NULL OR r.id <> _exclude_id)
    AND r.start_date <= _to
    AND r.end_date >= _from
$$;

CREATE OR REPLACE FUNCTION public.workspace_line_manager_id(_employee_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(e.ghc_manager_id, e.manager_id)
  FROM public.employees e
  WHERE e.id = _employee_id
$$;

CREATE OR REPLACE FUNCTION public.workspace_is_line_manager_of(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.current_employee_id() IS NOT NULL
    AND public.current_employee_id() = public.workspace_line_manager_id(_employee_id)
$$;

DROP FUNCTION IF EXISTS public.workspace_assert_leave_ok(uuid, uuid, date, date, uuid);

CREATE OR REPLACE FUNCTION public.workspace_assert_leave_ok(
  _employee_id uuid,
  _subsidiary_id uuid,
  _start date,
  _end date,
  _exclude_id uuid DEFAULT NULL,
  _bypass_window boolean DEFAULT false
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
  allowed_start date;
  allowed_end date;
  submit_deadline date;
BEGIN
  IF _end < _start THEN
    RAISE EXCEPTION 'End date must be on or after the start date.';
  END IF;
  IF public.workspace_working_days(_start, _end) < 1 THEN
    RAISE EXCEPTION 'Pick at least one working day (Monday to Friday).';
  END IF;

  q := public.workspace_quarter_start(_start);
  q_end := (q + interval '3 months' - interval '1 day')::date;
  allowed_start := q + 14;
  allowed_end := q_end - 14;
  submit_deadline := q + 13;

  IF public.workspace_quarter_start(_end) <> q THEN
    RAISE EXCEPTION 'Keep this block inside one quarter. Split across quarters into separate requests.';
  END IF;
  IF _start < allowed_start OR _end > allowed_end THEN
    RAISE EXCEPTION 'Leave cannot fall in the first 2 weeks or the last 2 weeks of the quarter (allowed % to %).',
      allowed_start, allowed_end;
  END IF;
  IF NOT _bypass_window AND CURRENT_DATE > submit_deadline THEN
    RAISE EXCEPTION 'Leave for this quarter had to be submitted by the end of week 2 (%). After that, HR reschedules remaining days around department conflicts.',
      submit_deadline;
  END IF;

  SELECT e.department INTO emp_dept
  FROM public.employees e
  WHERE e.id = _employee_id;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_leave_requests r
    WHERE r.employee_id = _employee_id
      AND r.status IN ('pending', 'manager_approved', 'approved')
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
    AND r.status IN ('pending', 'manager_approved', 'approved')
    AND r.employee_id <> _employee_id
    AND (_exclude_id IS NULL OR r.id <> _exclude_id)
    AND r.start_date <= _end
    AND r.end_date >= _start
    AND lower(btrim(COALESCE(e.department, ''))) = lower(btrim(COALESCE(emp_dept, '')))
  LIMIT 1;

  IF conflict_name IS NOT NULL THEN
    RAISE EXCEPTION 'Someone in your department is already booked for those dates (%). Pick different dates.', conflict_name;
  END IF;

  overlap := public.workspace_working_days(_start, _end);
  used := public.workspace_leave_used_in_range(_employee_id, q, q_end, _exclude_id);
  period := EXTRACT(YEAR FROM q)::int::text
    || '-Q'
    || (((EXTRACT(MONTH FROM q)::int - 1) / 3) + 1)::text;
  IF used + overlap > allowance THEN
    RAISE EXCEPTION 'Annual leave is 10 working days a quarter. This block uses % days in %, and you only have % remaining. Split into another block if you still have days left.',
      overlap, period, GREATEST(0, allowance - used);
  END IF;
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
  mgr uuid;
  mgr_name text;
  my_name text;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object(
      'period', EXTRACT(YEAR FROM q_start)::int::text || '-Q' || (((EXTRACT(MONTH FROM q_start)::int - 1) / 3) + 1)::text,
      'allowance', 10,
      'used', 0,
      'remaining', 10,
      'department', NULL,
      'employee_name', NULL,
      'manager_id', NULL,
      'manager_name', NULL,
      'is_hr', false,
      'is_line_manager', false,
      'submit_open', CURRENT_DATE <= q_start + 13,
      'submit_deadline', q_start + 13,
      'allowed_start', q_start + 14,
      'allowed_end', q_end - 14,
      'quarter_start', q_start,
      'quarter_end', q_end
    );
  END IF;

  SELECT e.department, e.name, public.workspace_line_manager_id(e.id)
    INTO my_dept, my_name, mgr
  FROM public.employees e
  WHERE e.id = me;

  SELECT m.name INTO mgr_name FROM public.employees m WHERE m.id = mgr;
  used := public.workspace_leave_used_in_range(me, q_start, q_end, NULL);

  RETURN jsonb_build_object(
    'period', EXTRACT(YEAR FROM q_start)::int::text || '-Q' || (((EXTRACT(MONTH FROM q_start)::int - 1) / 3) + 1)::text,
    'allowance', 10,
    'used', used,
    'remaining', GREATEST(0, 10 - used),
    'department', my_dept,
    'employee_name', my_name,
    'manager_id', mgr,
    'manager_name', mgr_name,
    'is_hr', public.workspace_is_hr(),
    'is_line_manager', EXISTS (
      SELECT 1 FROM public.employees r
      WHERE r.subsidiary_id = public.workspace_my_subsidiary_id()
        AND public.workspace_line_manager_id(r.id) = me
    ),
    'submit_open', CURRENT_DATE <= q_start + 13,
    'submit_deadline', q_start + 13,
    'allowed_start', q_start + 14,
    'allowed_end', q_end - 14,
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
    'day_count', public.workspace_working_days(r.start_date, r.end_date),
    'status', r.status,
    'note', r.note,
    'created_at', r.created_at,
    'manager_id', r.manager_id,
    'manager_name', mgr.name,
    'decided_by', r.decided_by
  ) ORDER BY r.start_date, e.name), '[]'::jsonb)
  FROM public.workspace_leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  LEFT JOIN public.employees mgr ON mgr.id = r.manager_id
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
  mgr uuid;
  initial_status text := 'pending';
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF _leave_type IS NULL OR _leave_type NOT IN (
    'annual', 'compassionate', 'maternity', 'study',
    'sick', 'unpaid', 'parental', 'other'
  ) THEN
    RAISE EXCEPTION 'Choose a leave type.';
  END IF;

  PERFORM public.workspace_assert_leave_ok(me, sid, _start_date, _end_date, NULL, public.workspace_is_hr());

  mgr := public.workspace_line_manager_id(me);
  IF mgr IS NULL OR mgr = me THEN
    initial_status := 'manager_approved';
  END IF;

  INSERT INTO public.workspace_leave_requests (
    subsidiary_id, employee_id, leave_type, start_date, end_date, note, status, manager_id
  ) VALUES (
    sid, me, _leave_type, _start_date, _end_date, reason, initial_status, mgr
  )
  RETURNING id INTO rid;
  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_cancel_leave(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
BEGIN
  UPDATE public.workspace_leave_requests
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = _request_id
    AND employee_id = me
    AND subsidiary_id = public.workspace_my_subsidiary_id()
    AND status IN ('pending', 'manager_approved', 'approved');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only cancel your own pending or approved leave.';
  END IF;
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
  row_status text;
  row_mgr uuid;
  can_mgr boolean := false;
  can_hr boolean := public.workspace_is_hr();
  next_status text;
BEGIN
  SELECT r.employee_id, r.subsidiary_id, r.start_date, r.end_date, r.status, r.manager_id
    INTO row_emp, row_sid, row_start, row_end, row_status, row_mgr
  FROM public.workspace_leave_requests r
  WHERE r.id = _request_id
    AND r.subsidiary_id = public.workspace_my_subsidiary_id()
    AND r.status IN ('pending', 'manager_approved');

  IF row_emp IS NULL THEN
    RAISE EXCEPTION 'No pending leave request to decide.';
  END IF;

  can_mgr := me = COALESCE(row_mgr, public.workspace_line_manager_id(row_emp));

  IF NOT can_mgr AND NOT can_hr THEN
    RAISE EXCEPTION 'Only the line manager or HR can approve or decline leave.';
  END IF;

  IF NOT _approve THEN
    UPDATE public.workspace_leave_requests
    SET status = 'declined',
        decided_by = me,
        decided_at = now(),
        updated_at = now()
    WHERE id = _request_id;
    RETURN;
  END IF;

  PERFORM public.workspace_assert_leave_ok(row_emp, row_sid, row_start, row_end, _request_id, true);

  IF row_status = 'pending' THEN
    IF can_mgr AND can_hr THEN
      next_status := 'approved';
    ELSIF can_mgr THEN
      next_status := 'manager_approved';
    ELSIF can_hr AND (row_mgr IS NULL OR row_mgr = row_emp) THEN
      next_status := 'approved';
    ELSE
      RAISE EXCEPTION 'Line manager must approve first.';
    END IF;
  ELSE
    IF NOT can_hr THEN
      RAISE EXCEPTION 'Only HR can give final approval.';
    END IF;
    next_status := 'approved';
  END IF;

  UPDATE public.workspace_leave_requests
  SET status = next_status,
      manager_decided_at = CASE
        WHEN row_status = 'pending' AND next_status IN ('manager_approved', 'approved') THEN now()
        ELSE manager_decided_at
      END,
      decided_by = CASE WHEN next_status = 'approved' THEN me ELSE decided_by END,
      decided_at = CASE WHEN next_status = 'approved' THEN now() ELSE decided_at END,
      updated_at = now()
  WHERE id = _request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_working_days(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_working_days_overlap(date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_leave_used_in_range(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_line_manager_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_is_line_manager_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_assert_leave_ok(uuid, uuid, date, date, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_my_leave_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_list_leave() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_request_leave(text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_cancel_leave(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_decide_leave(uuid, boolean) TO authenticated;
