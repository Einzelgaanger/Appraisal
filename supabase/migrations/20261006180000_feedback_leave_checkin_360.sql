-- Build-team feedback, applied for every company:
-- leave goes to HR (email + in-app) and only then to the line manager;
-- each leave type keeps its own balance;
-- monthly self check-in can always be drafted or submitted, with a comment on each question;
-- peer 360 aggregates are visible to everyone together, with no HR release step;
-- the Executive Office quarterly form uses its current name.

ALTER TABLE public.ghc_monthly_self_checkins
  ADD COLUMN IF NOT EXISTS question_comments jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.assessment_forms
SET title = 'Executive Office Quarterly Evaluation'
WHERE code = 'ea_quarterly';

-- 360 results are open for the whole company at the same time. HR does not hold them.
CREATE OR REPLACE FUNCTION public.peer_360_results_released(_period text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

COMMENT ON FUNCTION public.peer_360_results_released(text) IS
  'Peer 360 aggregates are visible to every employee together. There is no HR release step.';

CREATE OR REPLACE FUNCTION public.ghc_get_my_360_aggregate(_period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.ghc_me();
  peer_count integer := 0;
  result jsonb;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('released', true, 'peerCount', 0, 'scores', '[]'::jsonb, 'themes', '[]'::jsonb);
  END IF;

  SELECT COUNT(*) INTO peer_count
  FROM public.ghc_360_responses
  WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted';

  IF peer_count = 0 THEN
    RETURN jsonb_build_object('released', true, 'peerCount', 0, 'scores', '[]'::jsonb, 'themes', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'released', true,
    'peerCount', peer_count,
    'scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', k, 'label', l, 'avg', avg_score) ORDER BY ord)
      FROM (
        SELECT 1 ord, 'founders_lps' k, 'We only succeed when our founders and LPs succeed' l, ROUND(AVG(score_founders_lps)::numeric, 2) avg_score
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        UNION ALL
        SELECT 2, 'curious', 'Be voraciously curious', ROUND(AVG(score_curious)::numeric, 2)
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        UNION ALL
        SELECT 3, 'move_fast', 'Move fast and be detail oriented', ROUND(AVG(score_move_fast)::numeric, 2)
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        UNION ALL
        SELECT 4, 'overachievement', 'We only settle for overachievement', ROUND(AVG(score_overachievement)::numeric, 2)
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        UNION ALL
        SELECT 5, 'job_done', 'Your job isn''t done until the job is done', ROUND(AVG(score_job_done)::numeric, 2)
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
      ) s
    ), '[]'::jsonb),
    'themes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('text', did_well) ORDER BY submitted_at)
      FROM public.ghc_360_responses
      WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        AND did_well IS NOT NULL AND length(trim(did_well)) > 0
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_payload_bool(_payload jsonb, _key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _payload IS NULL OR NOT (_payload ? _key) THEN NULL
    WHEN jsonb_typeof(_payload -> _key) = 'null' THEN NULL
    WHEN jsonb_typeof(_payload -> _key) = 'boolean' THEN (_payload -> _key)::boolean
    WHEN lower(btrim(COALESCE(_payload ->> _key, ''))) IN ('true', 't', 'yes', '1') THEN true
    WHEN lower(btrim(COALESCE(_payload ->> _key, ''))) IN ('false', 'f', 'no', '0') THEN false
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_upsert_monthly_self_checkin(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.ghc_me();
  rid uuid;
  period text := NULLIF(btrim(COALESCE(_payload->>'period', '')), '');
  status text := coalesce(NULLIF(_payload->>'status', ''), 'draft');
  comments jsonb := CASE
    WHEN jsonb_typeof(_payload -> 'question_comments') = 'object' THEN _payload -> 'question_comments'
    ELSE '{}'::jsonb
  END;
  mgr uuid;
  sec uuid;
  tenant text;
  existing_status text;
BEGIN
  IF me IS NULL OR NOT public.ghc_is_active_member(me) THEN
    RAISE EXCEPTION 'Not an active member';
  END IF;
  IF period IS NULL OR period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;
  IF status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF NULLIF(_payload->>'fulfilled', '') IS NOT NULL
     AND NULLIF(_payload->>'fulfilled', '') NOT IN ('yes', 'neutral', 'no') THEN
    RAISE EXCEPTION 'Choose yes, neutral, or no for fulfilment';
  END IF;

  -- One check-in per person per month. A stale id must not block a new save.
  SELECT c.id, c.status INTO rid, existing_status
  FROM public.ghc_monthly_self_checkins c
  WHERE c.employee_id = me AND c.period = period
  LIMIT 1;

  IF existing_status = 'submitted' AND status = 'draft' THEN
    RAISE EXCEPTION 'This check-in is already submitted';
  END IF;

  IF rid IS NOT NULL THEN
    UPDATE public.ghc_monthly_self_checkins c SET
      time_off_this_quarter = public.ghc_payload_bool(_payload, 'time_off_this_quarter'),
      looking_forward_personal = public.ghc_payload_bool(_payload, 'looking_forward_personal'),
      looking_forward_work = public.ghc_payload_bool(_payload, 'looking_forward_work'),
      meeting_okrs = public.ghc_payload_bool(_payload, 'meeting_okrs'),
      displaying_growth = public.ghc_payload_bool(_payload, 'displaying_growth'),
      strong_relationship = public.ghc_payload_bool(_payload, 'strong_relationship'),
      policy_feedback = NULLIF(_payload->>'policy_feedback', ''),
      proud_this_month = public.ghc_payload_bool(_payload, 'proud_this_month'),
      personal_issues = public.ghc_payload_bool(_payload, 'personal_issues'),
      company_can_help = public.ghc_payload_bool(_payload, 'company_can_help'),
      motivated = public.ghc_payload_bool(_payload, 'motivated'),
      motivated_why = NULLIF(_payload->>'motivated_why', ''),
      fulfilled = NULLIF(_payload->>'fulfilled', ''),
      fulfilled_how = NULLIF(_payload->>'fulfilled_how', ''),
      additional_comments = NULLIF(_payload->>'additional_comments', ''),
      question_comments = comments,
      status = status,
      submitted_at = CASE WHEN status = 'submitted' THEN coalesce(c.submitted_at, now()) ELSE c.submitted_at END,
      updated_at = now()
    WHERE c.id = rid AND c.employee_id = me
    RETURNING c.id INTO rid;
  ELSE
    INSERT INTO public.ghc_monthly_self_checkins (
      employee_id, period, status,
      time_off_this_quarter, looking_forward_personal, looking_forward_work,
      meeting_okrs, displaying_growth, strong_relationship, policy_feedback,
      proud_this_month, personal_issues, company_can_help, motivated, motivated_why,
      fulfilled, fulfilled_how, additional_comments, question_comments,
      submitted_at
    ) VALUES (
      me, period, status,
      public.ghc_payload_bool(_payload, 'time_off_this_quarter'),
      public.ghc_payload_bool(_payload, 'looking_forward_personal'),
      public.ghc_payload_bool(_payload, 'looking_forward_work'),
      public.ghc_payload_bool(_payload, 'meeting_okrs'),
      public.ghc_payload_bool(_payload, 'displaying_growth'),
      public.ghc_payload_bool(_payload, 'strong_relationship'),
      NULLIF(_payload->>'policy_feedback', ''),
      public.ghc_payload_bool(_payload, 'proud_this_month'),
      public.ghc_payload_bool(_payload, 'personal_issues'),
      public.ghc_payload_bool(_payload, 'company_can_help'),
      public.ghc_payload_bool(_payload, 'motivated'),
      NULLIF(_payload->>'motivated_why', ''),
      NULLIF(_payload->>'fulfilled', ''),
      NULLIF(_payload->>'fulfilled_how', ''),
      NULLIF(_payload->>'additional_comments', ''),
      comments,
      CASE WHEN status = 'submitted' THEN now() ELSE NULL END
    )
    RETURNING id INTO rid;
  END IF;

  IF status = 'submitted' THEN
    BEGIN
      tenant := public.ghc_hub_tenant(me);
      SELECT coalesce(e.ghc_manager_id, e.manager_id),
             coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id)
      INTO mgr, sec
      FROM public.employees e WHERE e.id = me;

      IF mgr IS NOT NULL THEN
        PERFORM public.ghc_open_feedback_discussion('monthly_self', me, mgr, period, rid);
        PERFORM public.ghc_create_notification(
          mgr, 'monthly_self_submitted', 'Monthly self check-in submitted',
          'A team member submitted their monthly self check-in.',
          '/hub?tenant=' || coalesce(tenant, 'ghc') || '&tab=dashboard&ghcTab=results',
          period
        );
      END IF;
      IF sec IS NOT NULL AND sec IS DISTINCT FROM mgr THEN
        PERFORM public.ghc_open_feedback_discussion('monthly_self', me, sec, period, rid);
        PERFORM public.ghc_create_notification(
          sec, 'monthly_self_submitted', 'Monthly self check-in submitted',
          'A team member submitted their monthly self check-in.',
          '/hub?tenant=' || coalesce(tenant, 'ghc') || '&tab=dashboard&ghcTab=results',
          period
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'monthly self check-in saved, notice failed: %', SQLERRM;
    END;
  END IF;

  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_list_report_self_checkins(_period_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.ghc_me();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.employee_name)
    FROM (
      SELECT
        s.id, s.employee_id, emp.name AS employee_name, s.period, s.status, s.submitted_at,
        s.time_off_this_quarter, s.looking_forward_personal, s.looking_forward_work,
        s.meeting_okrs, s.displaying_growth, s.strong_relationship, s.policy_feedback,
        s.proud_this_month, s.personal_issues, s.company_can_help, s.motivated, s.motivated_why,
        s.fulfilled, s.fulfilled_how, s.additional_comments, s.question_comments
      FROM public.ghc_monthly_self_checkins s
      JOIN public.employees emp ON emp.id = s.employee_id
      WHERE s.period = _period_month
        AND s.status = 'submitted'
        AND public.ghc_can_view_employee_checkin(s.employee_id)
        AND s.employee_id IS DISTINCT FROM me
    ) t
  ), '[]'::jsonb);
END;
$$;

-- Leave: HR first, then the line manager. Each type has its own allowance.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_leave_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.workspace_leave_requests DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.workspace_leave_requests
  ADD CONSTRAINT workspace_leave_status_check CHECK (
    status IN ('pending', 'hr_approved', 'manager_approved', 'approved', 'declined', 'cancelled')
  );

ALTER TABLE public.boom_notifications DROP CONSTRAINT IF EXISTS boom_notifications_event_type_chk;
ALTER TABLE public.boom_notifications
  ADD CONSTRAINT boom_notifications_event_type_chk CHECK (
    event_type IN (
      'peer_360_received',
      'ea_quarterly_received',
      'monthly_self_submitted',
      'executive_submitted',
      'assessment_submitted',
      'leave_update'
    )
  );

CREATE OR REPLACE FUNCTION public.workspace_leave_allowance(_leave_type text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _leave_type
    WHEN 'annual' THEN 10
    WHEN 'sick' THEN 10
    WHEN 'compassionate' THEN 5
    WHEN 'maternity' THEN 90
    WHEN 'parental' THEN 10
    WHEN 'study' THEN 10
    WHEN 'unpaid' THEN 15
    ELSE 5
  END;
$$;

DROP FUNCTION IF EXISTS public.workspace_leave_used_in_range(uuid, date, date, uuid);

CREATE OR REPLACE FUNCTION public.workspace_leave_used_in_range(
  _employee_id uuid,
  _from date,
  _to date,
  _exclude_id uuid DEFAULT NULL,
  _leave_type text DEFAULT NULL
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
    AND r.status IN ('pending', 'hr_approved', 'manager_approved', 'approved')
    AND (_exclude_id IS NULL OR r.id <> _exclude_id)
    AND (_leave_type IS NULL OR r.leave_type = _leave_type)
    AND r.start_date <= _to
    AND r.end_date >= _from
$$;

CREATE OR REPLACE FUNCTION public.workspace_company_hr_ids(_subsidiary_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.subsidiary_id = _subsidiary_id
    AND (
      COALESCE(e.company_admin, false)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id
        WHERE lower(p.email) = lower(COALESCE(e.email, ''))
          AND ur.role = 'admin'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.workspace_notify_leave(
  _recipient uuid,
  _title text,
  _body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF _recipient IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM public.ghc_create_notification(
      _recipient,
      'leave_update',
      _title,
      _body,
      '/hub?tab=leave',
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leave notice failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.boom_notifications (
      recipient_employee_id, event_type, form_code, period, title, body, href, email_queued
    ) VALUES (
      _recipient,
      'leave_update',
      'leave',
      to_char(CURRENT_DATE, 'YYYY-MM'),
      _title,
      _body,
      '/hub?tab=leave',
      true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leave bell failed: %', SQLERRM;
  END;
END;
$$;

DROP FUNCTION IF EXISTS public.workspace_assert_leave_ok(uuid, uuid, date, date, uuid);
DROP FUNCTION IF EXISTS public.workspace_assert_leave_ok(uuid, uuid, date, date, uuid, boolean);

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
  allowed_start date;
  allowed_end date;
  submit_deadline date;
  kind text := COALESCE(NULLIF(_leave_type, ''), 'annual');
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
    IF _start < allowed_start OR _end > allowed_end THEN
      RAISE EXCEPTION 'Annual leave cannot fall in the first 2 weeks or the last 2 weeks of the quarter (allowed % to %).',
        allowed_start, allowed_end;
    END IF;
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
  year_start date := date_trunc('year', d)::date;
  year_end date := (year_start + interval '1 year' - interval '1 day')::date;
  used int := 0;
  my_dept text;
  mgr uuid;
  mgr_name text;
  my_name text;
  balances jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(
    kind,
    jsonb_build_object(
      'allowance', kind_allowance,
      'used', kind_used,
      'remaining', GREATEST(0, kind_allowance - kind_used)
    )
  ), '{}'::jsonb)
  INTO balances
  FROM (
    SELECT
      kind,
      public.workspace_leave_allowance(kind) AS kind_allowance,
      CASE
        WHEN me IS NULL THEN 0
        ELSE public.workspace_leave_used_in_range(
          me,
          CASE WHEN kind = 'maternity' THEN year_start ELSE q_start END,
          CASE WHEN kind = 'maternity' THEN year_end ELSE q_end END,
          NULL,
          kind
        )
      END AS kind_used
    FROM unnest(ARRAY['annual','sick','compassionate','maternity','parental','study','unpaid','other']) AS kind
  ) typed;

  IF me IS NOT NULL THEN
    SELECT e.department, e.name, public.workspace_line_manager_id(e.id)
      INTO my_dept, my_name, mgr
    FROM public.employees e
    WHERE e.id = me;
    SELECT m.name INTO mgr_name FROM public.employees m WHERE m.id = mgr;
    used := public.workspace_leave_used_in_range(me, q_start, q_end, NULL, 'annual');
  END IF;

  RETURN jsonb_build_object(
    'period', EXTRACT(YEAR FROM q_start)::int::text || '-Q' || (((EXTRACT(MONTH FROM q_start)::int - 1) / 3) + 1)::text,
    'allowance', 10,
    'used', used,
    'remaining', GREATEST(0, 10 - used),
    'balances', balances,
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
  my_name text;
  hr uuid;
  summary text;
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

  PERFORM public.workspace_assert_leave_ok(me, sid, _start_date, _end_date, NULL, public.workspace_is_hr(), _leave_type);

  SELECT e.name, public.workspace_line_manager_id(e.id) INTO my_name, mgr
  FROM public.employees e WHERE e.id = me;

  INSERT INTO public.workspace_leave_requests (
    subsidiary_id, employee_id, leave_type, start_date, end_date, note, status, manager_id
  ) VALUES (
    sid, me, _leave_type, _start_date, _end_date, reason, 'pending', mgr
  )
  RETURNING id INTO rid;

  summary := coalesce(my_name, 'A colleague') || ' requested ' || replace(_leave_type, '_', ' ')
    || ' leave from ' || to_char(_start_date, 'DD Mon YYYY') || ' to ' || to_char(_end_date, 'DD Mon YYYY')
    || '. Review it on the leave planner. It goes to the line manager only after HR clears it.';

  FOR hr IN
    SELECT workspace_company_hr_ids FROM public.workspace_company_hr_ids(sid)
  LOOP
    IF hr IS DISTINCT FROM me THEN
      PERFORM public.workspace_notify_leave(hr, 'Leave request waiting for HR', summary);
    END IF;
  END LOOP;

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
  SET status = 'cancelled', updated_at = now()
  WHERE id = _request_id
    AND employee_id = me
    AND subsidiary_id = public.workspace_my_subsidiary_id()
    AND status IN ('pending', 'hr_approved', 'manager_approved', 'approved');

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
  row_type text;
  row_name text;
  can_mgr boolean := false;
  can_hr boolean := public.workspace_is_hr();
  next_status text;
  summary text;
BEGIN
  SELECT r.employee_id, r.subsidiary_id, r.start_date, r.end_date, r.status, r.manager_id, r.leave_type, e.name
    INTO row_emp, row_sid, row_start, row_end, row_status, row_mgr, row_type, row_name
  FROM public.workspace_leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  WHERE r.id = _request_id
    AND r.subsidiary_id = public.workspace_my_subsidiary_id()
    AND r.status IN ('pending', 'hr_approved', 'manager_approved');

  IF row_emp IS NULL THEN
    RAISE EXCEPTION 'No pending leave request to decide.';
  END IF;

  can_mgr := me = COALESCE(row_mgr, public.workspace_line_manager_id(row_emp));
  summary := coalesce(row_name, 'A colleague') || '''s ' || replace(coalesce(row_type, 'leave'), '_', ' ')
    || ' leave (' || to_char(row_start, 'DD Mon') || ' – ' || to_char(row_end, 'DD Mon YYYY') || ')';

  IF NOT can_mgr AND NOT can_hr THEN
    RAISE EXCEPTION 'Only HR, then the line manager, can approve or decline leave.';
  END IF;

  IF NOT _approve THEN
    IF row_status = 'pending' AND NOT can_hr THEN
      RAISE EXCEPTION 'HR reviews this request first.';
    END IF;
    IF row_status = 'hr_approved' AND NOT can_mgr THEN
      RAISE EXCEPTION 'The line manager decides after HR.';
    END IF;
    UPDATE public.workspace_leave_requests
    SET status = 'declined', decided_by = me, decided_at = now(), updated_at = now()
    WHERE id = _request_id;
    IF row_emp IS DISTINCT FROM me THEN
      PERFORM public.workspace_notify_leave(row_emp, 'Leave request declined', summary || ' was declined.');
    END IF;
    RETURN;
  END IF;

  PERFORM public.workspace_assert_leave_ok(row_emp, row_sid, row_start, row_end, _request_id, true, row_type);

  IF row_status = 'pending' THEN
    IF NOT can_hr THEN
      RAISE EXCEPTION 'HR reviews this request first.';
    END IF;
    IF row_mgr IS NULL OR row_mgr = row_emp OR can_mgr THEN
      next_status := 'approved';
    ELSE
      next_status := 'hr_approved';
    END IF;
  ELSIF row_status = 'hr_approved' THEN
    IF NOT can_mgr THEN
      RAISE EXCEPTION 'Waiting for the line manager.';
    END IF;
    next_status := 'approved';
  ELSE
    IF NOT can_hr THEN
      RAISE EXCEPTION 'Only HR can finish this earlier request.';
    END IF;
    next_status := 'approved';
  END IF;

  UPDATE public.workspace_leave_requests
  SET status = next_status,
      manager_decided_at = CASE
        WHEN next_status = 'approved' AND row_status = 'hr_approved' THEN now()
        ELSE manager_decided_at
      END,
      decided_by = CASE WHEN next_status = 'approved' THEN me ELSE decided_by END,
      decided_at = CASE WHEN next_status = 'approved' THEN now() ELSE decided_at END,
      updated_at = now()
  WHERE id = _request_id;

  IF next_status = 'hr_approved' AND row_mgr IS NOT NULL AND row_mgr IS DISTINCT FROM me THEN
    PERFORM public.workspace_notify_leave(
      row_mgr,
      'Leave request waiting for you',
      summary || ' was cleared by HR and now needs the line manager.'
    );
  ELSIF next_status = 'approved' AND row_emp IS DISTINCT FROM me THEN
    PERFORM public.workspace_notify_leave(row_emp, 'Leave request approved', summary || ' is approved.');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_place_leave(
  _employee_id uuid,
  _leave_type text,
  _start_date date,
  _end_date date,
  _note text DEFAULT NULL,
  _request_id uuid DEFAULT NULL
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
  prev text;
  next_status text;
  emp_name text;
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF NOT public.workspace_is_hr() THEN
    RAISE EXCEPTION 'Only HR can place or move someone else''s leave.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id AND e.subsidiary_id = sid
  ) THEN
    RAISE EXCEPTION 'That person is not in this company.';
  END IF;
  IF _leave_type IS NULL OR _leave_type NOT IN (
    'annual', 'compassionate', 'maternity', 'study',
    'sick', 'unpaid', 'parental', 'other'
  ) THEN
    RAISE EXCEPTION 'Choose a leave type.';
  END IF;

  PERFORM public.workspace_assert_leave_ok(_employee_id, sid, _start_date, _end_date, _request_id, true, _leave_type);
  mgr := public.workspace_line_manager_id(_employee_id);
  SELECT e.name INTO emp_name FROM public.employees e WHERE e.id = _employee_id;

  IF _request_id IS NULL THEN
    next_status := CASE
      WHEN mgr IS NOT NULL AND mgr <> _employee_id AND mgr <> me THEN 'hr_approved'
      ELSE 'approved'
    END;
    INSERT INTO public.workspace_leave_requests (
      subsidiary_id, employee_id, leave_type, start_date, end_date, note,
      status, manager_id, decided_by, decided_at
    ) VALUES (
      sid, _employee_id, _leave_type, _start_date, _end_date, reason,
      next_status, mgr, CASE WHEN next_status = 'approved' THEN me ELSE NULL END,
      CASE WHEN next_status = 'approved' THEN now() ELSE NULL END
    ) RETURNING id INTO rid;
  ELSE
    SELECT status INTO prev
    FROM public.workspace_leave_requests
    WHERE id = _request_id AND employee_id = _employee_id AND subsidiary_id = sid;

    next_status := CASE
      WHEN prev = 'approved' THEN 'approved'
      WHEN mgr IS NOT NULL AND mgr <> _employee_id AND mgr <> me THEN 'hr_approved'
      ELSE 'approved'
    END;

    UPDATE public.workspace_leave_requests
    SET leave_type = _leave_type,
        start_date = _start_date,
        end_date = _end_date,
        note = reason,
        status = next_status,
        manager_id = COALESCE(manager_id, mgr),
        decided_by = CASE WHEN next_status = 'approved' THEN me ELSE decided_by END,
        decided_at = CASE WHEN next_status = 'approved' THEN now() ELSE decided_at END,
        updated_at = now()
    WHERE id = _request_id
      AND employee_id = _employee_id
      AND subsidiary_id = sid
      AND status IN ('pending', 'hr_approved', 'manager_approved', 'approved')
    RETURNING id INTO rid;

    IF rid IS NULL THEN
      RAISE EXCEPTION 'That leave request cannot be moved.';
    END IF;
  END IF;

  IF next_status = 'hr_approved' AND mgr IS NOT NULL THEN
    PERFORM public.workspace_notify_leave(
      mgr,
      'Leave placed by HR',
      coalesce(emp_name, 'A colleague') || '''s ' || replace(_leave_type, '_', ' ')
        || ' leave was cleared by HR and now needs the line manager.'
    );
  END IF;

  RETURN rid;
END;
$$;

REVOKE ALL ON FUNCTION public.ghc_payload_bool(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_company_hr_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_notify_leave(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.workspace_leave_allowance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_leave_used_in_range(uuid, date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_assert_leave_ok(uuid, uuid, date, date, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_my_leave_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_request_leave(text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_cancel_leave(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_decide_leave(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_place_leave(uuid, text, date, date, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
