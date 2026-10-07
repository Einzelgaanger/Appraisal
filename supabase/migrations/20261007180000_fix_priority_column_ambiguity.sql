-- Planner saves used a variable and a column with the same name (priority, status, level).
-- Postgres then refuses the save for every company. Keep the names apart.

CREATE OR REPLACE FUNCTION public.workspace_set_project_plan(
  _project_id uuid,
  _priority text,
  _status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  chosen_priority text := lower(btrim(COALESCE(_priority, 'medium')));
  chosen_status text := lower(btrim(COALESCE(_status, 'not_started')));
BEGIN
  IF NOT public.workspace_project_active(_project_id) THEN
    RAISE EXCEPTION 'You are not on this project.';
  END IF;
  IF chosen_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Choose a priority.';
  END IF;
  IF chosen_status NOT IN ('not_started', 'in_progress', 'done', 'blocked') THEN
    RAISE EXCEPTION 'Choose a status.';
  END IF;
  UPDATE public.workspace_projects
  SET priority = chosen_priority,
      status = chosen_status,
      updated_at = now()
  WHERE id = _project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_save_objective(
  _id uuid,
  _level text,
  _parent_id uuid,
  _title text,
  _priority text,
  _status text,
  _due_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
  v_period text := public.workspace_current_period();
  chosen_level text := lower(btrim(COALESCE(_level, '')));
  chosen_priority text := lower(btrim(COALESCE(_priority, 'medium')));
  chosen_status text := lower(btrim(COALESCE(_status, 'not_started')));
  saved uuid;
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF NOT public.workspace_can_manage_objectives() THEN
    RAISE EXCEPTION 'Company and unit objectives are set by leadership and managers.';
  END IF;
  IF chosen_level = 'company' AND NOT public.workspace_is_leadership() THEN
    RAISE EXCEPTION 'Company objectives are set by company leadership.';
  END IF;
  IF chosen_level NOT IN ('company', 'unit') THEN
    RAISE EXCEPTION 'Choose a company or unit objective.';
  END IF;
  IF chosen_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Choose a priority.';
  END IF;
  IF chosen_status NOT IN ('not_started', 'in_progress', 'done', 'blocked') THEN
    RAISE EXCEPTION 'Choose a status.';
  END IF;
  IF chosen_level = 'unit' AND NOT EXISTS (
    SELECT 1 FROM public.workspace_objectives o
    WHERE o.id = _parent_id AND o.level = 'company' AND o.subsidiary_id = sid
  ) THEN
    RAISE EXCEPTION 'A unit objective needs a company objective.';
  END IF;
  IF public.workspace_objectives_are_locked() AND NOT public.workspace_is_leadership() THEN
    RAISE EXCEPTION 'Objectives for this quarter are locked.';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.workspace_objectives (
      subsidiary_id, level, parent_id, title, priority, status, due_date, period, created_by
    ) VALUES (
      sid, chosen_level, CASE WHEN chosen_level = 'company' THEN NULL ELSE _parent_id END,
      btrim(_title), chosen_priority, chosen_status, _due_date, v_period, me
    ) RETURNING id INTO saved;
  ELSE
    UPDATE public.workspace_objectives
    SET title = btrim(_title),
        priority = chosen_priority,
        status = chosen_status,
        due_date = _due_date,
        parent_id = CASE WHEN chosen_level = 'company' THEN NULL ELSE _parent_id END,
        updated_at = now()
    WHERE id = _id AND subsidiary_id = sid AND level = chosen_level
    RETURNING id INTO saved;
    IF saved IS NULL THEN
      RAISE EXCEPTION 'That objective is not in this company.';
    END IF;
  END IF;
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_save_key_result(
  _id uuid,
  _title text,
  _company_objective_id uuid,
  _unit_objective_id uuid,
  _priority text,
  _status text,
  _due_date date,
  _owner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
  v_period text := public.workspace_current_period();
  owner uuid := COALESCE(_owner_id, me);
  chosen_priority text := lower(btrim(COALESCE(_priority, 'medium')));
  chosen_status text := lower(btrim(COALESCE(_status, 'not_started')));
  company_id uuid := _company_objective_id;
  saved uuid;
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF chosen_priority NOT IN ('low', 'medium', 'high', 'critical') OR chosen_status NOT IN ('not_started', 'in_progress', 'done', 'blocked') THEN
    RAISE EXCEPTION 'Choose a priority and a status.';
  END IF;
  IF owner <> me AND NOT public.workspace_is_leadership() AND NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = owner AND me IN (e.manager_id, e.ghc_manager_id)
  ) THEN
    RAISE EXCEPTION 'You can keep your own key results, or those of someone who reports to you.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e WHERE e.id = owner AND e.subsidiary_id = sid
  ) THEN
    RAISE EXCEPTION 'That person is not in this company.';
  END IF;

  IF _unit_objective_id IS NOT NULL THEN
    SELECT o.parent_id INTO company_id
    FROM public.workspace_objectives o
    WHERE o.id = _unit_objective_id AND o.level = 'unit' AND o.subsidiary_id = sid;
    IF company_id IS NULL THEN
      RAISE EXCEPTION 'Choose a unit objective in this company.';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.workspace_objectives o
    WHERE o.id = company_id AND o.level = 'company' AND o.subsidiary_id = sid
  ) THEN
    RAISE EXCEPTION 'A key result needs a company objective, or a unit objective.';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.workspace_key_results (
      subsidiary_id, owner_id, company_objective_id, unit_objective_id,
      title, priority, status, due_date, period, created_by
    ) VALUES (
      sid, owner, company_id, _unit_objective_id,
      btrim(_title), chosen_priority, chosen_status, _due_date, v_period, me
    ) RETURNING id INTO saved;
  ELSE
    UPDATE public.workspace_key_results
    SET title = btrim(_title),
        owner_id = owner,
        company_objective_id = company_id,
        unit_objective_id = _unit_objective_id,
        priority = chosen_priority,
        status = chosen_status,
        due_date = _due_date,
        updated_at = now()
    WHERE id = _id AND subsidiary_id = sid
      AND (owner_id = me OR public.workspace_is_leadership() OR EXISTS (
        SELECT 1 FROM public.employees e WHERE e.id = owner_id AND me IN (e.manager_id, e.ghc_manager_id)
      ))
    RETURNING id INTO saved;
    IF saved IS NULL THEN
      RAISE EXCEPTION 'That key result is not yours to edit.';
    END IF;
  END IF;
  RETURN saved;
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
  checkin_period text := NULLIF(btrim(COALESCE(_payload->>'period', '')), '');
  next_status text := coalesce(NULLIF(_payload->>'status', ''), 'draft');
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
  IF checkin_period IS NULL OR checkin_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;
  IF next_status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF NULLIF(_payload->>'fulfilled', '') IS NOT NULL
     AND NULLIF(_payload->>'fulfilled', '') NOT IN ('yes', 'neutral', 'no') THEN
    RAISE EXCEPTION 'Choose yes, neutral, or no for fulfilment';
  END IF;

  SELECT c.id, c.status INTO rid, existing_status
  FROM public.ghc_monthly_self_checkins c
  WHERE c.employee_id = me AND c.period = checkin_period
  LIMIT 1;

  IF existing_status = 'submitted' AND next_status = 'draft' THEN
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
      status = next_status,
      submitted_at = CASE WHEN next_status = 'submitted' THEN coalesce(c.submitted_at, now()) ELSE c.submitted_at END,
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
      me, checkin_period, next_status,
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
      CASE WHEN next_status = 'submitted' THEN now() ELSE NULL END
    )
    RETURNING id INTO rid;
  END IF;

  IF next_status = 'submitted' THEN
    BEGIN
      tenant := public.ghc_hub_tenant(me);
      SELECT coalesce(e.ghc_manager_id, e.manager_id),
             coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id)
      INTO mgr, sec
      FROM public.employees e WHERE e.id = me;

      IF mgr IS NOT NULL THEN
        PERFORM public.ghc_open_feedback_discussion('monthly_self', me, mgr, checkin_period, rid);
        PERFORM public.ghc_create_notification(
          mgr, 'monthly_self_submitted', 'Monthly self check-in submitted',
          'A team member submitted their monthly self check-in.',
          '/hub?tenant=' || coalesce(tenant, 'ghc') || '&tab=dashboard&ghcTab=results',
          checkin_period
        );
      END IF;
      IF sec IS NOT NULL AND sec IS DISTINCT FROM mgr THEN
        PERFORM public.ghc_open_feedback_discussion('monthly_self', me, sec, checkin_period, rid);
        PERFORM public.ghc_create_notification(
          sec, 'monthly_self_submitted', 'Monthly self check-in submitted',
          'A team member submitted their monthly self check-in.',
          '/hub?tenant=' || coalesce(tenant, 'ghc') || '&tab=dashboard&ghcTab=results',
          checkin_period
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'monthly self check-in saved, notice failed: %', SQLERRM;
    END;
  END IF;

  RETURN rid;
END;
$$;

NOTIFY pgrst, 'reload schema';
