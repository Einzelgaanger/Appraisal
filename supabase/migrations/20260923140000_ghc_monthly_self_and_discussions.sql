-- GHC monthly self check-in (everyone) + discussions for self + peer 360
-- Results visible to primary/secondary managers and Bunmi (platform admin / Bunmi email).

CREATE TABLE IF NOT EXISTS public.ghc_monthly_self_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  time_off_this_quarter boolean,
  looking_forward_personal boolean,
  looking_forward_work boolean,
  meeting_okrs boolean,
  displaying_growth boolean,
  strong_relationship boolean,
  policy_feedback text,
  proud_this_month boolean,
  personal_issues boolean,
  company_can_help boolean,
  motivated boolean,
  motivated_why text,
  fulfilled text CHECK (fulfilled IS NULL OR fulfilled IN ('yes', 'neutral', 'no')),
  fulfilled_how text,
  additional_comments text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period)
);

CREATE INDEX IF NOT EXISTS ghc_monthly_self_period_idx
  ON public.ghc_monthly_self_checkins (period, status);
CREATE INDEX IF NOT EXISTS ghc_monthly_self_employee_idx
  ON public.ghc_monthly_self_checkins (employee_id);

-- Generic discussion threads for monthly_self and peer_360 (eval threads stay separate)
CREATE TABLE IF NOT EXISTS public.ghc_feedback_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('monthly_self', 'peer_360')),
  subject_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  facilitator_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period text NOT NULL,
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, subject_employee_id, facilitator_employee_id, period)
);

CREATE TABLE IF NOT EXISTS public.ghc_feedback_discussion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL REFERENCES public.ghc_feedback_discussions(id) ON DELETE CASCADE,
  author_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ghc_feedback_disc_subject_idx
  ON public.ghc_feedback_discussions (subject_employee_id, kind, period);
CREATE INDEX IF NOT EXISTS ghc_feedback_msg_disc_idx
  ON public.ghc_feedback_discussion_messages (discussion_id, created_at);

ALTER TABLE public.ghc_monthly_self_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_feedback_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_feedback_discussion_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ghc_is_bunmi(_employee_id uuid DEFAULT public.ghc_me())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id
      AND (
        lower(split_part(coalesce(e.email, ''), '@', 1)) = 'bunmi.akinyemiju'
        OR public.ghc_is_admin()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.ghc_can_view_employee_checkin(_subject uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.ghc_me() = _subject
    OR public.ghc_is_admin()
    OR public.ghc_is_bunmi()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = _subject
        AND (
          coalesce(e.ghc_manager_id, e.manager_id) = public.ghc_me()
          OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = public.ghc_me()
        )
    );
$$;

DROP POLICY IF EXISTS ghc_self_checkin_select ON public.ghc_monthly_self_checkins;
CREATE POLICY ghc_self_checkin_select ON public.ghc_monthly_self_checkins
FOR SELECT TO authenticated
USING (public.ghc_can_view_employee_checkin(employee_id));

DROP POLICY IF EXISTS ghc_self_checkin_write ON public.ghc_monthly_self_checkins;
CREATE POLICY ghc_self_checkin_write ON public.ghc_monthly_self_checkins
FOR ALL TO authenticated
USING (employee_id = public.ghc_me() OR public.ghc_is_admin())
WITH CHECK (employee_id = public.ghc_me() OR public.ghc_is_admin());

DROP POLICY IF EXISTS ghc_feedback_disc_select ON public.ghc_feedback_discussions;
CREATE POLICY ghc_feedback_disc_select ON public.ghc_feedback_discussions
FOR SELECT TO authenticated
USING (
  subject_employee_id = public.ghc_me()
  OR facilitator_employee_id = public.ghc_me()
  OR public.ghc_is_admin()
  OR public.ghc_is_bunmi()
);

DROP POLICY IF EXISTS ghc_feedback_disc_write ON public.ghc_feedback_discussions;
CREATE POLICY ghc_feedback_disc_write ON public.ghc_feedback_discussions
FOR ALL TO authenticated
USING (
  subject_employee_id = public.ghc_me()
  OR facilitator_employee_id = public.ghc_me()
  OR public.ghc_is_admin()
)
WITH CHECK (
  subject_employee_id = public.ghc_me()
  OR facilitator_employee_id = public.ghc_me()
  OR public.ghc_is_admin()
);

DROP POLICY IF EXISTS ghc_feedback_msg_select ON public.ghc_feedback_discussion_messages;
CREATE POLICY ghc_feedback_msg_select ON public.ghc_feedback_discussion_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ghc_feedback_discussions d
    WHERE d.id = discussion_id
      AND (
        d.subject_employee_id = public.ghc_me()
        OR d.facilitator_employee_id = public.ghc_me()
        OR public.ghc_is_admin()
        OR public.ghc_is_bunmi()
      )
  )
);

DROP POLICY IF EXISTS ghc_feedback_msg_insert ON public.ghc_feedback_discussion_messages;
CREATE POLICY ghc_feedback_msg_insert ON public.ghc_feedback_discussion_messages
FOR INSERT TO authenticated
WITH CHECK (
  author_employee_id = public.ghc_me()
  AND EXISTS (
    SELECT 1 FROM public.ghc_feedback_discussions d
    WHERE d.id = discussion_id
      AND (
        d.subject_employee_id = public.ghc_me()
        OR d.facilitator_employee_id = public.ghc_me()
        OR public.ghc_is_admin()
      )
  )
);

GRANT SELECT, INSERT, UPDATE ON public.ghc_monthly_self_checkins TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ghc_feedback_discussions TO authenticated;
GRANT SELECT, INSERT ON public.ghc_feedback_discussion_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.ghc_open_feedback_discussion(
  _kind text,
  _subject_id uuid,
  _facilitator_id uuid,
  _period text,
  _source_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  did uuid;
BEGIN
  IF _kind NOT IN ('monthly_self', 'peer_360') THEN
    RAISE EXCEPTION 'Invalid discussion kind';
  END IF;

  INSERT INTO public.ghc_feedback_discussions (
    kind, subject_employee_id, facilitator_employee_id, period, source_id
  )
  VALUES (_kind, _subject_id, _facilitator_id, _period, _source_id)
  ON CONFLICT (kind, subject_employee_id, facilitator_employee_id, period)
  DO UPDATE SET
    source_id = COALESCE(EXCLUDED.source_id, public.ghc_feedback_discussions.source_id),
    updated_at = now()
  RETURNING id INTO did;

  RETURN did;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_upsert_monthly_self_checkin(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  rid uuid := NULLIF(_payload->>'id', '')::uuid;
  period text := NULLIF(_payload->>'period', '');
  status text := coalesce(NULLIF(_payload->>'status', ''), 'draft');
  mgr uuid;
  sec uuid;
  bunmi uuid;
  tenant text := public.ghc_hub_tenant(me);
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

  IF rid IS NOT NULL THEN
    UPDATE public.ghc_monthly_self_checkins c SET
      time_off_this_quarter = (_payload->>'time_off_this_quarter')::boolean,
      looking_forward_personal = (_payload->>'looking_forward_personal')::boolean,
      looking_forward_work = (_payload->>'looking_forward_work')::boolean,
      meeting_okrs = (_payload->>'meeting_okrs')::boolean,
      displaying_growth = (_payload->>'displaying_growth')::boolean,
      strong_relationship = (_payload->>'strong_relationship')::boolean,
      policy_feedback = NULLIF(_payload->>'policy_feedback', ''),
      proud_this_month = (_payload->>'proud_this_month')::boolean,
      personal_issues = (_payload->>'personal_issues')::boolean,
      company_can_help = (_payload->>'company_can_help')::boolean,
      motivated = (_payload->>'motivated')::boolean,
      motivated_why = NULLIF(_payload->>'motivated_why', ''),
      fulfilled = NULLIF(_payload->>'fulfilled', ''),
      fulfilled_how = NULLIF(_payload->>'fulfilled_how', ''),
      additional_comments = NULLIF(_payload->>'additional_comments', ''),
      status = status,
      submitted_at = CASE WHEN status = 'submitted' THEN coalesce(c.submitted_at, now()) ELSE c.submitted_at END,
      updated_at = now()
    WHERE c.id = rid AND c.employee_id = me
    RETURNING c.id INTO rid;
    IF rid IS NULL THEN
      RAISE EXCEPTION 'Check-in not found';
    END IF;
  ELSE
    INSERT INTO public.ghc_monthly_self_checkins (
      employee_id, period, status,
      time_off_this_quarter, looking_forward_personal, looking_forward_work,
      meeting_okrs, displaying_growth, strong_relationship, policy_feedback,
      proud_this_month, personal_issues, company_can_help, motivated, motivated_why,
      fulfilled, fulfilled_how, additional_comments,
      submitted_at
    ) VALUES (
      me, period, status,
      (_payload->>'time_off_this_quarter')::boolean,
      (_payload->>'looking_forward_personal')::boolean,
      (_payload->>'looking_forward_work')::boolean,
      (_payload->>'meeting_okrs')::boolean,
      (_payload->>'displaying_growth')::boolean,
      (_payload->>'strong_relationship')::boolean,
      NULLIF(_payload->>'policy_feedback', ''),
      (_payload->>'proud_this_month')::boolean,
      (_payload->>'personal_issues')::boolean,
      (_payload->>'company_can_help')::boolean,
      (_payload->>'motivated')::boolean,
      NULLIF(_payload->>'motivated_why', ''),
      NULLIF(_payload->>'fulfilled', ''),
      NULLIF(_payload->>'fulfilled_how', ''),
      NULLIF(_payload->>'additional_comments', ''),
      CASE WHEN status = 'submitted' THEN now() ELSE NULL END
    )
    ON CONFLICT (employee_id, period) DO UPDATE SET
      time_off_this_quarter = EXCLUDED.time_off_this_quarter,
      looking_forward_personal = EXCLUDED.looking_forward_personal,
      looking_forward_work = EXCLUDED.looking_forward_work,
      meeting_okrs = EXCLUDED.meeting_okrs,
      displaying_growth = EXCLUDED.displaying_growth,
      strong_relationship = EXCLUDED.strong_relationship,
      policy_feedback = EXCLUDED.policy_feedback,
      proud_this_month = EXCLUDED.proud_this_month,
      personal_issues = EXCLUDED.personal_issues,
      company_can_help = EXCLUDED.company_can_help,
      motivated = EXCLUDED.motivated,
      motivated_why = EXCLUDED.motivated_why,
      fulfilled = EXCLUDED.fulfilled,
      fulfilled_how = EXCLUDED.fulfilled_how,
      additional_comments = EXCLUDED.additional_comments,
      status = EXCLUDED.status,
      submitted_at = CASE
        WHEN EXCLUDED.status = 'submitted' THEN coalesce(public.ghc_monthly_self_checkins.submitted_at, now())
        ELSE public.ghc_monthly_self_checkins.submitted_at
      END,
      updated_at = now()
    RETURNING id INTO rid;
  END IF;

  IF status = 'submitted' THEN
    SELECT coalesce(e.ghc_manager_id, e.manager_id),
           coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id)
    INTO mgr, sec
    FROM public.employees e WHERE e.id = me;

    IF mgr IS NOT NULL THEN
      PERFORM public.ghc_open_feedback_discussion('monthly_self', me, mgr, period, rid);
      PERFORM public.ghc_create_notification(
        mgr,
        'monthly_self_submitted',
        'Monthly self check-in submitted',
        'A team member submitted their monthly self check-in.',
        '/hub?tenant=' || tenant || '&tab=dashboard&ghcTab=results',
        period
      );
    END IF;
    IF sec IS NOT NULL AND sec IS DISTINCT FROM mgr THEN
      PERFORM public.ghc_open_feedback_discussion('monthly_self', me, sec, period, rid);
      PERFORM public.ghc_create_notification(
        sec,
        'monthly_self_submitted',
        'Monthly self check-in submitted',
        'A team member submitted their monthly self check-in.',
        '/hub?tenant=' || tenant || '&tab=dashboard&ghcTab=results',
        period
      );
    END IF;

    FOR bunmi IN
      SELECT e.id FROM public.employees e
      WHERE lower(split_part(coalesce(e.email, ''), '@', 1)) = 'bunmi.akinyemiju'
        AND public.ghc_member_pool(e.id) = public.ghc_member_pool(me)
        AND e.id IS DISTINCT FROM mgr
        AND e.id IS DISTINCT FROM sec
        AND e.id IS DISTINCT FROM me
    LOOP
      PERFORM public.ghc_create_notification(
        bunmi,
        'monthly_self_submitted',
        'Monthly self check-in submitted',
        'A team member submitted their monthly self check-in.',
        '/hub?tenant=' || tenant || '&tab=dashboard&ghcTab=results',
        period
      );
    END LOOP;
  END IF;

  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_get_feedback_discussion(
  _kind text,
  _subject_id uuid,
  _period text,
  _facilitator_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  fac uuid := coalesce(_facilitator_id,
    CASE WHEN me = _subject_id THEN NULL ELSE me END
  );
  did uuid;
  result jsonb;
BEGIN
  IF NOT (
    me = _subject_id OR me = fac OR public.ghc_is_admin() OR public.ghc_is_bunmi()
    OR public.ghc_can_view_employee_checkin(_subject_id)
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF fac IS NULL THEN
    -- Subject viewing: pick primary manager thread
    SELECT coalesce(e.ghc_manager_id, e.manager_id) INTO fac
    FROM public.employees e WHERE e.id = _subject_id;
  END IF;
  IF fac IS NULL THEN
    RETURN jsonb_build_object('discussion_id', null, 'messages', '[]'::jsonb);
  END IF;

  SELECT d.id INTO did
  FROM public.ghc_feedback_discussions d
  WHERE d.kind = _kind
    AND d.subject_employee_id = _subject_id
    AND d.facilitator_employee_id = fac
    AND d.period = _period;

  IF did IS NULL AND _kind = 'peer_360' THEN
    did := public.ghc_open_feedback_discussion('peer_360', _subject_id, fac, _period, NULL);
  END IF;

  SELECT jsonb_build_object(
    'discussion_id', did,
    'kind', _kind,
    'subject_id', _subject_id,
    'facilitator_id', fac,
    'period', _period,
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'author_employee_id', m.author_employee_id,
        'author_name', e.name,
        'body', m.body,
        'created_at', m.created_at
      ) ORDER BY m.created_at)
      FROM public.ghc_feedback_discussion_messages m
      JOIN public.employees e ON e.id = m.author_employee_id
      WHERE m.discussion_id = did
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_post_feedback_discussion_message(
  _discussion_id uuid,
  _body text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  d public.ghc_feedback_discussions%ROWTYPE;
  mid uuid;
  other uuid;
  tenant text := public.ghc_hub_tenant(me);
BEGIN
  IF length(trim(coalesce(_body, ''))) < 1 THEN
    RAISE EXCEPTION 'Message required';
  END IF;

  SELECT * INTO d FROM public.ghc_feedback_discussions WHERE id = _discussion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discussion not found'; END IF;
  IF me IS DISTINCT FROM d.subject_employee_id
     AND me IS DISTINCT FROM d.facilitator_employee_id
     AND NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.ghc_feedback_discussion_messages (discussion_id, author_employee_id, body)
  VALUES (_discussion_id, me, trim(_body))
  RETURNING id INTO mid;

  UPDATE public.ghc_feedback_discussions SET updated_at = now() WHERE id = _discussion_id;

  other := CASE WHEN me = d.subject_employee_id THEN d.facilitator_employee_id ELSE d.subject_employee_id END;
  PERFORM public.ghc_create_notification(
    other,
    'feedback_discussion_message',
    'New discussion message',
    'You have a new message on a ' || replace(d.kind, '_', ' ') || ' thread.',
    '/hub?tenant=' || tenant || '&tab=dashboard&ghcTab=results',
    d.period
  );

  RETURN mid;
END;
$$;

-- Tasks: everyone gets monthly_self; managers keep monthly_manager; peer 360; evals
CREATE OR REPLACE FUNCTION public.ghc_get_my_tasks(_period_month text, _period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  pool text;
  tasks jsonb := '[]'::jsonb;
  me_name text;
  me_role text;
BEGIN
  IF me IS NULL OR NOT public.ghc_is_active_member(me) THEN
    RETURN '[]'::jsonb;
  END IF;
  pool := public.ghc_member_pool(me);
  SELECT e.name, e.role INTO me_name, me_role FROM public.employees e WHERE e.id = me;

  -- Monthly self check-in (everyone)
  tasks := COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb)
    FROM (
      SELECT
        'monthly_self'::text AS kind,
        'Monthly self check-in'::text AS title,
        me AS subject_id,
        me_name AS subject_name,
        me_role AS subject_role,
        _period_month AS period,
        COALESCE(c.status, 'todo') AS status,
        c.id AS record_id
      FROM (SELECT 1) _
      LEFT JOIN public.ghc_monthly_self_checkins c
        ON c.employee_id = me AND c.period = _period_month
    ) t
  ), '[]'::jsonb);

  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name)
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
      WHERE public.ghc_member_pool(e.id) = pool
        AND e.id <> me
        AND (coalesce(e.ghc_manager_id, e.manager_id) = me
             OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
      ORDER BY e.id, e.name
    ) t
  ), '[]'::jsonb);

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
      WHERE public.ghc_member_pool(e.id) = pool
        AND e.id <> me
        AND split_part(lower(coalesce(e.email,'')), '@', 1)
            IS DISTINCT FROM split_part(lower(coalesce((SELECT email FROM employees WHERE id = me), '')), '@', 1)
      ORDER BY coalesce(nullif(split_part(lower(coalesce(e.email,'')), '@', 1), ''), e.id::text),
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
      WHERE public.ghc_member_pool(e.id) = pool
        AND e.id <> me
        AND (coalesce(e.ghc_manager_id, e.manager_id) = me
             OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
      ORDER BY e.id, e.name
    ) t
  ), '[]'::jsonb);

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

CREATE OR REPLACE FUNCTION public.ghc_get_directory_status(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  pool text := coalesce(public.ghc_member_pool(me), 'ghc');
  expected_360 int;
BEGIN
  IF NOT (public.ghc_is_admin() OR public.ghc_is_active_member(me)) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT greatest(count(*) - 1, 0) INTO expected_360
  FROM public.employees e
  WHERE public.ghc_member_pool(e.id) = pool;

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
          SELECT 1 FROM public.ghc_monthly_self_checkins s
          WHERE s.employee_id = e.id AND s.period = _period_month AND s.status = 'submitted'
        ) AS monthly_self_done,
        EXISTS (
          SELECT 1 FROM public.ghc_monthly_reviews m
          WHERE m.report_id = e.id AND m.period = _period_month AND m.status = 'submitted'
        ) AS monthly_done,
        (
          SELECT COUNT(*) FROM public.ghc_360_responses r
          WHERE r.reviewer_id = e.id AND r.period = _period_quarter AND r.status = 'submitted'
        ) AS peer_360_given,
        expected_360 AS peer_360_expected,
        (
          SELECT COUNT(*) FROM public.ghc_360_responses r
          WHERE r.reviewee_id = e.id AND r.period = _period_quarter AND r.status = 'submitted'
        ) AS peer_360_count,
        EXISTS (
          SELECT 1 FROM public.ghc_quarterly_evaluations q
          WHERE q.employee_id = e.id AND q.period = _period_quarter AND q.status IN ('submitted', 'acknowledged')
        ) AS eval_done
      FROM public.employees e
      WHERE public.ghc_member_pool(e.id) = pool
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_admin_completion_summary(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pool text;
  roster int;
  expected_360_pairs int;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  pool := coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc');
  SELECT count(*) INTO roster FROM public.employees e WHERE public.ghc_member_pool(e.id) = pool;
  expected_360_pairs := greatest(roster * (roster - 1), 0);

  RETURN jsonb_build_object(
    'roster', roster,
    'monthlySelfSubmitted', (
      SELECT count(*) FROM public.ghc_monthly_self_checkins s
      WHERE s.period = _period_month
        AND s.status = 'submitted'
        AND public.ghc_member_pool(s.employee_id) = pool
    ),
    'monthlySelfOpen', greatest(roster - (
      SELECT count(*) FROM public.ghc_monthly_self_checkins s
      WHERE s.period = _period_month
        AND s.status = 'submitted'
        AND public.ghc_member_pool(s.employee_id) = pool
    ), 0),
    'monthlySubmitted', (
      SELECT count(*) FROM public.ghc_monthly_reviews r
      WHERE r.period = _period_month
        AND r.status = 'submitted'
        AND public.ghc_member_pool(r.report_id) = pool
    ),
    'peer360Submitted', (
      SELECT count(*) FROM public.ghc_360_responses r
      WHERE r.period = _period_quarter
        AND r.status = 'submitted'
        AND public.ghc_member_pool(r.reviewee_id) = pool
    ),
    'peer360Expected', expected_360_pairs,
    'evaluationsSubmitted', (
      SELECT count(*) FROM public.ghc_quarterly_evaluations q
      WHERE q.period = _period_quarter
        AND q.status IN ('submitted', 'acknowledged')
        AND public.ghc_member_pool(q.employee_id) = pool
    ),
    'evaluationsAcknowledged', (
      SELECT count(*) FROM public.ghc_quarterly_evaluations q
      WHERE q.period = _period_quarter
        AND q.status = 'acknowledged'
        AND public.ghc_member_pool(q.employee_id) = pool
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_admin_completion_roster(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pool text;
  expected_360 int;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  pool := coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc');
  SELECT greatest(count(*) - 1, 0) INTO expected_360
  FROM public.employees e WHERE public.ghc_member_pool(e.id) = pool;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name)
    FROM (
      SELECT
        e.id,
        e.name,
        e.email,
        e.role,
        EXISTS (
          SELECT 1 FROM public.ghc_monthly_self_checkins s
          WHERE s.employee_id = e.id AND s.period = _period_month AND s.status = 'submitted'
        ) AS monthly_self_done,
        (
          SELECT COUNT(*) FROM public.ghc_360_responses r
          WHERE r.reviewer_id = e.id AND r.period = _period_quarter AND r.status = 'submitted'
        ) AS peer_360_given,
        expected_360 AS peer_360_expected,
        (
          SELECT COUNT(*) FROM public.ghc_360_responses r
          WHERE r.reviewer_id = e.id AND r.period = _period_quarter AND r.status = 'submitted'
        ) >= expected_360 AS peer_360_done
      FROM public.employees e
      WHERE public.ghc_member_pool(e.id) = pool
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_list_report_self_checkins(_period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.employee_name)
    FROM (
      SELECT
        s.id,
        s.employee_id,
        emp.name AS employee_name,
        s.period,
        s.status,
        s.submitted_at,
        s.time_off_this_quarter,
        s.looking_forward_personal,
        s.looking_forward_work,
        s.meeting_okrs,
        s.displaying_growth,
        s.strong_relationship,
        s.policy_feedback,
        s.proud_this_month,
        s.motivated,
        s.motivated_why,
        s.fulfilled,
        s.fulfilled_how,
        s.additional_comments
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

GRANT EXECUTE ON FUNCTION public.ghc_is_bunmi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_can_view_employee_checkin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_open_feedback_discussion(text, uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_upsert_monthly_self_checkin(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_feedback_discussion(text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_post_feedback_discussion_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_my_tasks(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_directory_status(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_admin_completion_summary(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_admin_completion_roster(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_list_report_self_checkins(text) TO authenticated;
