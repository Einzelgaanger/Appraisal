-- GHC production hardening: email notifications, release/ack flow, partner perms,
-- login email resolution, directory manager fields, safer notification hrefs.

-- ---------------------------------------------------------------------------
-- Login email: prefer profile.employee_id (dual-email / EO+GHC people)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.boom_employee_login_email(_employee uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (
      SELECT lower(p.email)
      FROM public.profiles p
      WHERE p.employee_id = _employee
      ORDER BY p.email NULLS LAST
      LIMIT 1
    ),
    (
      SELECT lower(p.email)
      FROM public.profiles p
      JOIN public.employees e ON lower(p.email) = lower(e.email)
      WHERE e.id = _employee
      LIMIT 1
    ),
    (SELECT lower(email) FROM public.employees WHERE id = _employee)
  );
$$;

-- ---------------------------------------------------------------------------
-- In-app + branded email notifications for GHC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ghc_create_notification(
  _employee_id uuid,
  _event_type text,
  _title text,
  _body text,
  _href text DEFAULT '/hub?tenant=ghc&tab=survey',
  _period text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nid uuid;
  href text;
  html text;
BEGIN
  href := COALESCE(nullif(trim(_href), ''), '/hub?tenant=ghc&tab=survey');
  -- Prefer tenant-aware hub links
  IF href NOT LIKE '%tenant=%' AND href LIKE '/hub%' THEN
    IF href LIKE '%?%' THEN
      href := href || '&tenant=ghc';
    ELSE
      href := href || '?tenant=ghc';
    END IF;
  END IF;

  INSERT INTO public.ghc_notifications (recipient_employee_id, event_type, period, title, body, href)
  VALUES (_employee_id, _event_type, _period, _title, _body, href)
  RETURNING id INTO nid;

  BEGIN
    html := public.boom_branded_email_html(
      'GreenHouse Capital appraisal',
      _title,
      '<p style="margin:0 0 12px;line-height:1.55;color:#334155">' || replace(replace(_body, '<', '&lt;'), '>', '&gt;') || '</p>',
      'Open workspace',
      'https://ghc.vgg.app' || href,
      'You received this because you are on the GreenHouse Capital appraisal roster.'
    );
    PERFORM public.boom_queue_transactional_email(
      _employee_id,
      _title || ' · GreenHouse Capital',
      html,
      'ghc_' || coalesce(_event_type, 'notice'),
      jsonb_build_object(
        'event_type', _event_type,
        'period', _period,
        'notification_id', nid,
        'href', href
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ghc email queue failed for %: %', _employee_id, SQLERRM;
  END;

  RETURN nid;
END;
$$;

-- ---------------------------------------------------------------------------
-- Prefer active login identity for ghc_me (profile-linked first)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ghc_me()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  auth_email text;
  ghc_id uuid;
BEGIN
  me := public.current_employee_id();

  IF me IS NOT NULL AND public.ghc_is_active_member(me) THEN
    RETURN me;
  END IF;

  SELECT lower(coalesce(p.email, u.email))
  INTO auth_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();

  IF auth_email IS NOT NULL THEN
    SELECT e.id INTO ghc_id
    FROM public.employees e
    WHERE coalesce(e.ghc_appraisal_active, false)
      AND e.email IS NOT NULL
      AND lower(e.email) = auth_email
    ORDER BY CASE WHEN e.id = me THEN 0 ELSE 1 END
    LIMIT 1;
    IF ghc_id IS NOT NULL THEN RETURN ghc_id; END IF;

    SELECT e.id INTO ghc_id
    FROM public.employees e
    WHERE coalesce(e.ghc_appraisal_active, false)
      AND e.email IS NOT NULL
      AND split_part(lower(e.email), '@', 1) = split_part(auth_email, '@', 1)
    ORDER BY CASE WHEN e.id = me THEN 0 ELSE 1 END,
             CASE WHEN e.subsidiary_id = public.ghc_subsidiary_id() THEN 0 ELSE 1 END
    LIMIT 1;
    IF ghc_id IS NOT NULL THEN RETURN ghc_id; END IF;
  END IF;

  RETURN me;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tasks: acknowledge when manager submits (no silent stuck-on-release)
-- Hybrid 360 still gated by cycle release for aggregates.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ghc_get_my_tasks(_period_month text, _period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  tasks jsonb := '[]'::jsonb;
BEGIN
  IF me IS NULL OR NOT public.ghc_is_active_member(me) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name), '[]'::jsonb)
  INTO tasks
  FROM (
    SELECT DISTINCT ON (e.id)
      'monthly_manager'::text AS kind,
      'Monthly manager review'::text AS title,
      e.id AS subject_id,
      e.name AS subject_name,
      e.role AS subject_role,
      _period_month AS period,
      COALESCE(r.status, 'todo') AS status,
      r.id AS record_id
    FROM public.employees e
    LEFT JOIN public.ghc_monthly_reviews r
      ON r.report_id = e.id AND r.manager_id = me AND r.period = _period_month
    WHERE coalesce(e.ghc_appraisal_active, false)
      AND e.id <> me
      AND (coalesce(e.ghc_manager_id, e.manager_id) = me
           OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
    ORDER BY e.id, e.name
  ) t;

  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name)
    FROM (
      SELECT DISTINCT ON (coalesce(nullif(split_part(lower(coalesce(e.email,'')), '@', 1), ''), e.id::text))
        'peer_360'::text AS kind,
        'Quarterly 360 feedback'::text AS title,
        e.id AS subject_id,
        e.name AS subject_name,
        e.role AS subject_role,
        _period_quarter AS period,
        COALESCE(r.status, 'todo') AS status,
        r.id AS record_id
      FROM public.employees e
      LEFT JOIN public.ghc_360_responses r
        ON r.reviewee_id = e.id AND r.reviewer_id = me AND r.period = _period_quarter
      WHERE coalesce(e.ghc_appraisal_active, false)
        AND e.id <> me
        AND split_part(lower(coalesce(e.email,'')), '@', 1)
            IS DISTINCT FROM split_part(lower(coalesce((SELECT email FROM employees WHERE id = me), '')), '@', 1)
      ORDER BY coalesce(nullif(split_part(lower(coalesce(e.email,'')), '@', 1), ''), e.id::text),
               CASE WHEN e.subsidiary_id = public.ghc_subsidiary_id() THEN 0 ELSE 1 END,
               e.name
    ) t
  ), '[]'::jsonb);

  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name)
    FROM (
      SELECT DISTINCT ON (e.id)
        'quarterly_evaluation'::text AS kind,
        'Quarterly performance evaluation'::text AS title,
        e.id AS subject_id,
        e.name AS subject_name,
        e.role AS subject_role,
        _period_quarter AS period,
        COALESCE(q.status, 'todo') AS status,
        q.id AS record_id
      FROM public.employees e
      LEFT JOIN public.ghc_quarterly_evaluations q
        ON q.employee_id = e.id AND q.manager_id = me AND q.period = _period_quarter
      WHERE coalesce(e.ghc_appraisal_active, false)
        AND e.id <> me
        AND (coalesce(e.ghc_manager_id, e.manager_id) = me
             OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
      ORDER BY e.id, e.name
    ) t
  ), '[]'::jsonb);

  -- Employee acknowledgement after manager submits (production flow)
  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb)
    FROM (
      SELECT
        'acknowledge_evaluation'::text AS kind,
        'Acknowledge quarterly evaluation'::text AS title,
        q.employee_id AS subject_id,
        emp.name AS subject_name,
        emp.role AS subject_role,
        q.period AS period,
        q.status AS status,
        q.id AS record_id
      FROM public.ghc_quarterly_evaluations q
      JOIN public.employees emp ON emp.id = q.employee_id
      WHERE q.employee_id = me
        AND q.period = _period_quarter
        AND q.status IN ('submitted', 'acknowledged')
    ) t
  ), '[]'::jsonb);

  RETURN tasks;
END;
$$;

-- On eval submit: notify with results href + auto-release row for acknowledgement
CREATE OR REPLACE FUNCTION public.ghc_upsert_quarterly_evaluation(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  eid uuid;
  employee uuid := (_payload->>'employee_id')::uuid;
  v_period text := _payload->>'period';
  st text := COALESCE(_payload->>'status', 'draft');
  scores record;
BEGIN
  IF me IS NULL OR (NOT public.ghc_manages(me, employee) AND NOT public.ghc_is_admin()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO scores FROM public.ghc_compute_evaluation_scores(
    (_payload->>'score_technical')::integer,
    (_payload->>'score_founders_lps')::integer,
    (_payload->>'score_curious')::integer,
    (_payload->>'score_move_fast')::integer,
    (_payload->>'score_overachievement')::integer,
    (_payload->>'score_job_done')::integer,
    (_payload->>'score_growth')::integer
  );

  INSERT INTO public.ghc_quarterly_evaluations AS q (
    id, manager_id, employee_id, period, review_type, status,
    score_technical, comment_technical,
    score_founders_lps, comment_founders_lps,
    score_curious, comment_curious,
    score_move_fast, comment_move_fast,
    score_overachievement, comment_overachievement,
    score_job_done, comment_job_done,
    score_growth, comment_growth,
    strengths, improvements, improvement_goals,
    culture_weight_score, technical_weight_score, growth_weight_score,
    total_score, total_pct, band_rating,
    submitted_at, released_at, updated_at
  ) VALUES (
    COALESCE((_payload->>'id')::uuid, gen_random_uuid()),
    COALESCE((_payload->>'manager_id')::uuid, me),
    employee,
    v_period,
    COALESCE(_payload->>'review_type', 'Q1'),
    st,
    (_payload->>'score_technical')::integer, _payload->>'comment_technical',
    (_payload->>'score_founders_lps')::integer, _payload->>'comment_founders_lps',
    (_payload->>'score_curious')::integer, _payload->>'comment_curious',
    (_payload->>'score_move_fast')::integer, _payload->>'comment_move_fast',
    (_payload->>'score_overachievement')::integer, _payload->>'comment_overachievement',
    (_payload->>'score_job_done')::integer, _payload->>'comment_job_done',
    (_payload->>'score_growth')::integer, _payload->>'comment_growth',
    COALESCE(_payload->'strengths', '[]'::jsonb),
    COALESCE(_payload->'improvements', '[]'::jsonb),
    COALESCE(_payload->'improvement_goals', '[]'::jsonb),
    scores.culture_weight_score, scores.technical_weight_score, scores.growth_weight_score,
    scores.total_score, scores.total_pct, scores.band_rating,
    CASE WHEN st = 'submitted' THEN now() ELSE NULL END,
    CASE WHEN st = 'submitted' THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (manager_id, employee_id, period) DO UPDATE SET
    review_type = EXCLUDED.review_type,
    status = EXCLUDED.status,
    score_technical = EXCLUDED.score_technical,
    comment_technical = EXCLUDED.comment_technical,
    score_founders_lps = EXCLUDED.score_founders_lps,
    comment_founders_lps = EXCLUDED.comment_founders_lps,
    score_curious = EXCLUDED.score_curious,
    comment_curious = EXCLUDED.comment_curious,
    score_move_fast = EXCLUDED.score_move_fast,
    comment_move_fast = EXCLUDED.comment_move_fast,
    score_overachievement = EXCLUDED.score_overachievement,
    comment_overachievement = EXCLUDED.comment_overachievement,
    score_job_done = EXCLUDED.score_job_done,
    comment_job_done = EXCLUDED.comment_job_done,
    score_growth = EXCLUDED.score_growth,
    comment_growth = EXCLUDED.comment_growth,
    strengths = EXCLUDED.strengths,
    improvements = EXCLUDED.improvements,
    improvement_goals = EXCLUDED.improvement_goals,
    culture_weight_score = EXCLUDED.culture_weight_score,
    technical_weight_score = EXCLUDED.technical_weight_score,
    growth_weight_score = EXCLUDED.growth_weight_score,
    total_score = EXCLUDED.total_score,
    total_pct = EXCLUDED.total_pct,
    band_rating = EXCLUDED.band_rating,
    submitted_at = CASE WHEN EXCLUDED.status = 'submitted' THEN COALESCE(q.submitted_at, now()) ELSE q.submitted_at END,
    released_at = CASE WHEN EXCLUDED.status = 'submitted' THEN COALESCE(q.released_at, now()) ELSE q.released_at END,
    updated_at = now()
  RETURNING id INTO eid;

  INSERT INTO public.ghc_partner_recommendations (evaluation_id, action_option, sort_order)
  SELECT eid, a.action, a.ord
  FROM (VALUES
    ('Promote to new level', 1),
    ('Salary Review', 2),
    ('Reward with Spot Bonus', 3),
    ('Confirm Resource?', 4),
    ('Growth Coaching', 5),
    ('Performance Improvement Plan', 6),
    ('Demotion', 7),
    ('No Action Required', 8)
  ) AS a(action, ord)
  ON CONFLICT (evaluation_id, action_option) DO NOTHING;

  IF st = 'submitted' THEN
    PERFORM public.ghc_create_notification(
      employee, 'evaluation_submitted',
      'Your quarterly evaluation is ready',
      'Your manager submitted your quarterly performance evaluation. Please review and acknowledge.',
      '/hub?tenant=ghc&tab=survey&ghcTab=results', v_period
    );
  END IF;

  RETURN eid;
END;
$$;

-- Release period: also stamp evals; email on 360 release via ghc_create_notification
CREATE OR REPLACE FUNCTION public.ghc_release_period(_kind text, _period text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid uuid;
  rec record;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  INSERT INTO public.ghc_cycle_settings (subsidiary_id, kind, period, released_at, released_by)
  VALUES (public.ghc_subsidiary_id(), _kind, _period, now(), public.ghc_me())
  ON CONFLICT (subsidiary_id, kind, period) DO UPDATE
  SET released_at = now(), released_by = public.ghc_me()
  RETURNING id INTO sid;

  IF _kind = 'peer_360' THEN
    FOR rec IN
      SELECT e.id
      FROM public.employees e
      WHERE coalesce(e.ghc_appraisal_active, false)
    LOOP
      PERFORM public.ghc_create_notification(
        rec.id,
        'peer_360_released',
        '360 results released',
        'Your anonymous peer 360 aggregate is now available.',
        '/hub?tenant=ghc&tab=dashboard',
        _period
      );
    END LOOP;
  ELSIF _kind = 'quarterly_evaluation' THEN
    UPDATE public.ghc_quarterly_evaluations
    SET released_at = COALESCE(released_at, now()), updated_at = now()
    WHERE period = _period
      AND status IN ('submitted', 'acknowledged');
  END IF;

  RETURN sid;
END;
$$;

-- Partner board: managers may set recommendation_by_manager; HR/admin all fields
CREATE OR REPLACE FUNCTION public.ghc_upsert_partner_recommendation(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  rid uuid;
  eval_id uuid := (_payload->>'evaluation_id')::uuid;
  is_mgr boolean := false;
BEGIN
  IF eval_id IS NULL AND (_payload->>'id') IS NOT NULL THEN
    SELECT evaluation_id INTO eval_id FROM public.ghc_partner_recommendations WHERE id = (_payload->>'id')::uuid;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ghc_quarterly_evaluations q
    WHERE q.id = eval_id AND (q.manager_id = me OR public.ghc_is_admin())
  ) INTO is_mgr;

  IF NOT is_mgr THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF public.ghc_is_admin() THEN
    UPDATE public.ghc_partner_recommendations
    SET comments_by_hr = COALESCE(_payload->>'comments_by_hr', comments_by_hr),
        recommendation_by_manager = COALESCE(_payload->>'recommendation_by_manager', recommendation_by_manager),
        recommendation_by_hr = COALESCE(_payload->>'recommendation_by_hr', recommendation_by_hr),
        partners_decision = COALESCE(_payload->>'partners_decision', partners_decision),
        updated_at = now()
    WHERE id = (_payload->>'id')::uuid
       OR (evaluation_id = eval_id AND action_option = _payload->>'action_option')
    RETURNING id INTO rid;
  ELSE
    UPDATE public.ghc_partner_recommendations
    SET recommendation_by_manager = COALESCE(_payload->>'recommendation_by_manager', recommendation_by_manager),
        updated_at = now()
    WHERE id = (_payload->>'id')::uuid
       OR (evaluation_id = eval_id AND action_option = _payload->>'action_option')
    RETURNING id INTO rid;
  END IF;

  RETURN rid;
END;
$$;

-- Directory includes ghc manager fields for "your reports" filtering
CREATE OR REPLACE FUNCTION public.ghc_get_directory_status(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.ghc_is_admin() OR public.ghc_is_active_member(public.ghc_me())) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.hierarchy_level, t.name)
    FROM (
      SELECT
        e.id,
        e.name,
        e.role,
        e.department,
        COALESCE(e.ghc_hierarchy_level, e.hierarchy_level) AS hierarchy_level,
        coalesce(e.ghc_manager_id, e.manager_id) AS manager_id,
        coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) AS secondary_manager_id,
        e.email,
        EXISTS (
          SELECT 1 FROM public.ghc_monthly_reviews m
          WHERE m.report_id = e.id AND m.period = _period_month AND m.status = 'submitted'
        ) AS monthly_done,
        (
          SELECT COUNT(*) FROM public.ghc_360_responses r
          WHERE r.reviewee_id = e.id AND r.period = _period_quarter AND r.status = 'submitted'
        ) AS peer_360_count,
        EXISTS (
          SELECT 1 FROM public.ghc_quarterly_evaluations q
          WHERE q.employee_id = e.id AND q.period = _period_quarter AND q.status IN ('submitted', 'acknowledged')
        ) AS eval_done
      FROM public.employees e
      WHERE COALESCE(e.ghc_appraisal_active, false)
    ) t
  ), '[]'::jsonb);
END;
$$;

-- Own submitted/acknowledged evaluations for My Results (without relying on task runner)
CREATE OR REPLACE FUNCTION public.ghc_get_my_evaluations(_period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
BEGIN
  IF me IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.submitted_at DESC NULLS LAST)
    FROM (
      SELECT
        q.id,
        q.period,
        q.status,
        q.total_score,
        q.total_pct,
        q.band_rating,
        q.submitted_at,
        q.acknowledged_at,
        q.released_at,
        mgr.name AS manager_name
      FROM public.ghc_quarterly_evaluations q
      JOIN public.employees mgr ON mgr.id = q.manager_id
      WHERE q.employee_id = me
        AND q.period = _period_quarter
        AND q.status IN ('submitted', 'acknowledged')
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ghc_get_my_evaluations(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_my_tasks(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_create_notification(uuid, text, text, text, text, text) TO authenticated;

-- Monthly submit href fix
CREATE OR REPLACE FUNCTION public.ghc_upsert_monthly_review(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  rid uuid;
  report uuid := (_payload->>'report_id')::uuid;
  v_period text := _payload->>'period';
  st text := COALESCE(_payload->>'status', 'draft');
BEGIN
  IF me IS NULL OR NOT public.ghc_manages(me, report) THEN
    IF NOT public.ghc_is_admin() THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
  END IF;

  INSERT INTO public.ghc_monthly_reviews AS m (
    id, manager_id, report_id, period, status,
    proud_this_month, personal_issues, company_can_help, motivated, motivated_why,
    fulfilled, fulfilled_how, time_off_this_quarter, looking_forward_personal, looking_forward_work,
    meeting_okrs, displaying_growth, strong_relationship, policy_feedback,
    culture_founders_lps, culture_curious, culture_move_fast, culture_overachievement, culture_job_done,
    feedback_to_report, feedback_from_report, additional_comments,
    submitted_at, updated_at
  ) VALUES (
    COALESCE((_payload->>'id')::uuid, gen_random_uuid()),
    me, report, v_period, st,
    (_payload->>'proud_this_month')::boolean,
    (_payload->>'personal_issues')::boolean,
    (_payload->>'company_can_help')::boolean,
    (_payload->>'motivated')::boolean,
    _payload->>'motivated_why',
    _payload->>'fulfilled',
    _payload->>'fulfilled_how',
    (_payload->>'time_off_this_quarter')::boolean,
    (_payload->>'looking_forward_personal')::boolean,
    (_payload->>'looking_forward_work')::boolean,
    (_payload->>'meeting_okrs')::boolean,
    (_payload->>'displaying_growth')::boolean,
    (_payload->>'strong_relationship')::boolean,
    _payload->>'policy_feedback',
    (_payload->>'culture_founders_lps')::integer,
    (_payload->>'culture_curious')::integer,
    (_payload->>'culture_move_fast')::integer,
    (_payload->>'culture_overachievement')::integer,
    (_payload->>'culture_job_done')::integer,
    _payload->>'feedback_to_report',
    _payload->>'feedback_from_report',
    _payload->>'additional_comments',
    CASE WHEN st = 'submitted' THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (manager_id, report_id, period) DO UPDATE SET
    status = EXCLUDED.status,
    proud_this_month = EXCLUDED.proud_this_month,
    personal_issues = EXCLUDED.personal_issues,
    company_can_help = EXCLUDED.company_can_help,
    motivated = EXCLUDED.motivated,
    motivated_why = EXCLUDED.motivated_why,
    fulfilled = EXCLUDED.fulfilled,
    fulfilled_how = EXCLUDED.fulfilled_how,
    time_off_this_quarter = EXCLUDED.time_off_this_quarter,
    looking_forward_personal = EXCLUDED.looking_forward_personal,
    looking_forward_work = EXCLUDED.looking_forward_work,
    meeting_okrs = EXCLUDED.meeting_okrs,
    displaying_growth = EXCLUDED.displaying_growth,
    strong_relationship = EXCLUDED.strong_relationship,
    policy_feedback = EXCLUDED.policy_feedback,
    culture_founders_lps = EXCLUDED.culture_founders_lps,
    culture_curious = EXCLUDED.culture_curious,
    culture_move_fast = EXCLUDED.culture_move_fast,
    culture_overachievement = EXCLUDED.culture_overachievement,
    culture_job_done = EXCLUDED.culture_job_done,
    feedback_to_report = EXCLUDED.feedback_to_report,
    feedback_from_report = EXCLUDED.feedback_from_report,
    additional_comments = EXCLUDED.additional_comments,
    submitted_at = CASE WHEN EXCLUDED.status = 'submitted' THEN COALESCE(m.submitted_at, now()) ELSE m.submitted_at END,
    updated_at = now()
  RETURNING id INTO rid;

  IF st = 'submitted' THEN
    PERFORM public.ghc_create_notification(
      report, 'monthly_review_submitted',
      'Your monthly review was submitted',
      'Your manager submitted this month''s 1:1 review.',
      '/hub?tenant=ghc&tab=survey', v_period
    );
  END IF;

  RETURN rid;
END;
$$;
