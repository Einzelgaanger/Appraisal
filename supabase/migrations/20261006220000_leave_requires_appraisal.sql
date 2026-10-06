-- Leave applications stay closed while 360 feedback or the quarterly appraisal
-- for the current quarter is still open. The same rule applies in every company.
-- Executive Team checks BOOM peer 360, Executive Office Quarterly Evaluation, and
-- the executive self-assessment where that person has one. GHC and VigiPay check
-- peer 360, the quarterly evaluation a manager owes, and an evaluation waiting
-- to be acknowledged. People with no appraisal duties are not blocked.
-- HR can still place or move leave. The employee cannot file the request themselves.

CREATE OR REPLACE FUNCTION public.workspace_appraisal_leave_block(_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp uuid := _employee_id;
  cycle text;
  pool text;
  sid uuid;
  active_eo boolean := false;
  my_email text;
  emp_name text;
  open_360 int := 0;
  open_quarterly int := 0;
  open_ack int := 0;
  still text;
  who text;
  bunmi uuid;
  eo uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  IF emp IS NULL THEN
    RETURN NULL;
  END IF;

  cycle := EXTRACT(YEAR FROM CURRENT_DATE)::int::text
    || '-Q'
    || (((EXTRACT(MONTH FROM CURRENT_DATE)::int - 1) / 3) + 1)::text;

  SELECT e.subsidiary_id, COALESCE(e.eo_appraisal_active, false), e.email, e.name
    INTO sid, active_eo, my_email, emp_name
  FROM public.employees e
  WHERE e.id = emp;

  IF sid IS NULL THEN
    RETURN NULL;
  END IF;

  pool := public.ghc_member_pool(emp);

  IF pool IS NOT NULL AND sid IS DISTINCT FROM eo THEN
    SELECT count(*) INTO open_360
    FROM (
      SELECT DISTINCT ON (coalesce(nullif(split_part(lower(coalesce(e.email, '')), '@', 1), ''), e.id::text))
        e.id
      FROM public.employees e
      WHERE public.ghc_member_pool(e.id) = pool
        AND e.id <> emp
        AND split_part(lower(coalesce(e.email, '')), '@', 1)
            IS DISTINCT FROM split_part(lower(coalesce(my_email, '')), '@', 1)
      ORDER BY coalesce(nullif(split_part(lower(coalesce(e.email, '')), '@', 1), ''), e.id::text), e.name
    ) targets
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.ghc_360_responses r
      WHERE r.reviewer_id = emp
        AND r.reviewee_id = targets.id
        AND r.period = cycle
        AND r.status = 'submitted'
    );

    SELECT count(*) INTO open_quarterly
    FROM (
      SELECT DISTINCT ON (e.id) e.id
      FROM public.employees e
      WHERE public.ghc_member_pool(e.id) = pool
        AND e.id <> emp
        AND (
          coalesce(e.ghc_manager_id, e.manager_id) = emp
          OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = emp
        )
      ORDER BY e.id
    ) reports
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.ghc_quarterly_evaluations q
      WHERE q.employee_id = reports.id
        AND q.manager_id = emp
        AND q.period = cycle
        AND q.status IN ('submitted', 'acknowledged')
    );

    SELECT count(*) INTO open_ack
    FROM public.ghc_quarterly_evaluations q
    WHERE q.employee_id = emp
      AND q.period = cycle
      AND q.status = 'submitted';

  ELSIF sid = eo AND active_eo THEN
    SELECT count(*) INTO open_360
    FROM public.employees e
    WHERE e.subsidiary_id = eo
      AND COALESCE(e.eo_appraisal_active, false)
      AND e.id <> emp
      AND public.boom_peer_360_allowed(emp, e.id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.assessment_responses r
        JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'peer_360'
        WHERE r.reviewer_id = emp
          AND r.reviewee_id = e.id
          AND r.period = cycle
          AND r.status = 'submitted'
      );

    SELECT id INTO bunmi
    FROM public.employees
    WHERE lower(email) = lower('bunmi.akinyemiju@peopleos.co')
    LIMIT 1;

    SELECT count(*) INTO open_quarterly
    FROM (
      SELECT e.id AS rid
      FROM public.eo_ea_quarterly_pairs p
      JOIN public.employees e ON e.id = p.reviewee_employee_id
      WHERE p.reviewer_employee_id = emp
        AND p.review_mode = 'standard'
        AND COALESCE(e.eo_appraisal_active, false)
      UNION
      SELECT e.id
      FROM public.eo_ea_quarterly_pairs p
      JOIN public.employees e ON e.id = p.reviewee_employee_id
      WHERE p.reviewer_employee_id = emp
        AND emp IS NOT DISTINCT FROM bunmi
        AND p.review_mode = 'epa_gceo'
        AND public.boom_bunmi_ea_quarterly_l1(e.id)
        AND COALESCE(e.eo_appraisal_active, false)
    ) due
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.assessment_responses r
      JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'ea_quarterly'
      WHERE r.reviewer_id = emp
        AND r.reviewee_id = due.rid
        AND r.period = cycle
        AND r.status = 'submitted'
    );

    IF public.boom_executive_self_allowed(emp) AND NOT EXISTS (
      SELECT 1
      FROM public.assessment_responses r
      JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'executive'
      WHERE r.reviewer_id = emp
        AND r.reviewee_id = emp
        AND r.period = cycle
        AND r.status = 'submitted'
    ) THEN
      open_quarterly := open_quarterly + 1;
    END IF;
  END IF;

  IF open_360 = 0 AND open_quarterly = 0 AND open_ack = 0 THEN
    RETURN NULL;
  END IF;

  still := concat_ws(
    ' and ',
    CASE
      WHEN open_360 = 1 THEN '1 peer 360 review'
      WHEN open_360 > 1 THEN open_360::text || ' peer 360 reviews'
    END,
    CASE
      WHEN open_quarterly = 1 THEN '1 quarterly appraisal'
      WHEN open_quarterly > 1 THEN open_quarterly::text || ' quarterly appraisals'
    END,
    CASE
      WHEN open_ack = 1 THEN '1 quarterly appraisal to acknowledge'
      WHEN open_ack > 1 THEN open_ack::text || ' quarterly appraisals to acknowledge'
    END
  );

  IF emp = public.current_employee_id() THEN
    who := 'You cannot apply for leave yet.';
  ELSE
    who := coalesce(nullif(btrim(emp_name), ''), 'This person') || ' cannot apply for leave yet.';
  END IF;

  RETURN who || ' Still open for ' || cycle || ': ' || still || '.';
END;
$$;

COMMENT ON FUNCTION public.workspace_appraisal_leave_block(uuid) IS
  'Why this person cannot apply for leave, or null when their 360 feedback and quarterly appraisal for the current quarter are done. Same rule for every company.';

REVOKE ALL ON FUNCTION public.workspace_appraisal_leave_block(uuid) FROM PUBLIC, anon, authenticated;

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
    'quarter_end', q_end,
    'appraisal_block', CASE WHEN me IS NULL THEN NULL ELSE public.workspace_appraisal_leave_block(me) END
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
  appraisal_block text;
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

  appraisal_block := public.workspace_appraisal_leave_block(me);
  IF appraisal_block IS NOT NULL THEN
    RAISE EXCEPTION '%', appraisal_block;
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

NOTIFY pgrst, 'reload schema';
