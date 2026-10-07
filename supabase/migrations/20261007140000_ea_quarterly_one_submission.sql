-- One Executive Office Quarterly Evaluation per person per quarter.
-- The first assigned manager to submit it covers that quarter. Every other
-- assigned manager sees that appraisal and cannot file a second one.

CREATE OR REPLACE FUNCTION public.pick_visible_assessment_response(
  _form_id uuid,
  _reviewer uuid,
  _reviewee uuid,
  _period text,
  _form_code text
)
RETURNS TABLE (id uuid, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.status
  FROM public.assessment_responses r
  WHERE r.form_id = _form_id
    AND r.reviewee_id = _reviewee
    AND r.period = _period
    AND (
      (_form_code = 'ea_quarterly' AND r.status = 'submitted')
      OR r.reviewer_id = _reviewer
    )
  ORDER BY
    CASE WHEN _form_code = 'ea_quarterly' AND r.status = 'submitted' THEN 0 ELSE 1 END,
    CASE WHEN _form_code = 'ea_quarterly' AND r.status = 'submitted' THEN r.submitted_at END ASC NULLS LAST,
    r.updated_at DESC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pick_visible_assessment_response(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.block_second_ea_quarterly()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  form_code text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT f.code INTO form_code
  FROM public.assessment_forms f
  WHERE f.id = NEW.form_id;

  IF form_code IS DISTINCT FROM 'ea_quarterly' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.assessment_responses r
    WHERE r.form_id = NEW.form_id
      AND r.reviewee_id = NEW.reviewee_id
      AND r.period = NEW.period
      AND r.status = 'submitted'
      AND r.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'This quarterly evaluation is already submitted for this person. Open it to view the completed appraisal.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_one_ea_quarterly_per_person ON public.assessment_responses;
CREATE TRIGGER trg_one_ea_quarterly_per_person
  BEFORE INSERT OR UPDATE OF status ON public.assessment_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.block_second_ea_quarterly();

REVOKE ALL ON FUNCTION public.block_second_ea_quarterly() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Assigned managers can read a submitted quarterly evaluation" ON public.assessment_responses;
CREATE POLICY "Assigned managers can read a submitted quarterly evaluation"
ON public.assessment_responses
FOR SELECT TO authenticated
USING (
  status = 'submitted'
  AND EXISTS (
    SELECT 1
    FROM public.assessment_forms f
    WHERE f.id = assessment_responses.form_id
      AND f.code = 'ea_quarterly'
  )
  AND EXISTS (
    SELECT 1
    FROM public.eo_ea_quarterly_pairs p
    WHERE p.reviewee_employee_id = assessment_responses.reviewee_id
      AND (
        p.reviewer_employee_id = public.current_employee_id()
        OR assessment_responses.reviewee_id = public.current_employee_id()
      )
  )
);

DROP POLICY IF EXISTS "Assigned managers can read submitted quarterly answers" ON public.assessment_answers;
CREATE POLICY "Assigned managers can read submitted quarterly answers"
ON public.assessment_answers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.assessment_responses r
    JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'ea_quarterly'
    JOIN public.eo_ea_quarterly_pairs p ON p.reviewee_employee_id = r.reviewee_id
    WHERE r.id = assessment_answers.response_id
      AND r.status = 'submitted'
      AND (
        p.reviewer_employee_id = public.current_employee_id()
        OR r.reviewee_id = public.current_employee_id()
      )
  )
);

CREATE OR REPLACE FUNCTION public.ea_quarterly_submitted_for(_reviewee uuid, _period text)
RETURNS TABLE (response_id uuid, reviewer_id uuid, reviewer_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR me = _reviewee
    OR EXISTS (
      SELECT 1
      FROM public.eo_ea_quarterly_pairs p
      WHERE p.reviewee_employee_id = _reviewee
        AND p.reviewer_employee_id = me
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, r.reviewer_id, rev.name
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'ea_quarterly'
  JOIN public.employees rev ON rev.id = r.reviewer_id
  WHERE r.reviewee_id = _reviewee
    AND r.period = _period
    AND r.status = 'submitted'
  ORDER BY r.submitted_at ASC NULLS LAST
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ea_quarterly_submitted_for(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_shared_ea_quarterly(_period text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.reviewee_name)
    FROM (
      SELECT
        e.id AS reviewee_id,
        e.name AS reviewee_name,
        e.role AS reviewee_role,
        e.department AS reviewee_department,
        CASE WHEN r.id IS NULL THEN 'todo' ELSE 'submitted' END AS status,
        r.id AS response_id,
        rev.name AS reviewer_name,
        r.submitted_at,
        sec.avg_score,
        sec.score_pct
      FROM public.eo_ea_quarterly_pairs p
      JOIN public.employees e ON e.id = p.reviewee_employee_id
      LEFT JOIN LATERAL (
        SELECT r1.id, r1.reviewer_id, r1.submitted_at
        FROM public.assessment_responses r1
        JOIN public.assessment_forms f ON f.id = r1.form_id AND f.code = 'ea_quarterly'
        WHERE r1.reviewee_id = e.id
          AND r1.period = _period
          AND r1.status = 'submitted'
        ORDER BY r1.submitted_at ASC NULLS LAST
        LIMIT 1
      ) r ON true
      LEFT JOIN public.employees rev ON rev.id = r.reviewer_id
      LEFT JOIN LATERAL (
        SELECT
          ROUND(AVG(a.score)::numeric, 2) AS avg_score,
          ROUND((AVG(a.score)::numeric / 5) * 100, 0) AS score_pct
        FROM public.assessment_answers a
        JOIN public.assessment_questions q ON q.id = a.question_id
        WHERE a.response_id = r.id
          AND a.score IS NOT NULL
          AND NOT a.no_opportunity
          AND q.question_type = 'scored'
      ) sec ON true
      WHERE p.reviewer_employee_id = me
        AND e.eo_appraisal_active
    ) x
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_ea_quarterly(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_review_assignments(_period_quarter text, _period_month text)
RETURNS TABLE (
  form_code text,
  form_title text,
  reviewee_id uuid,
  reviewee_name text,
  reviewee_role text,
  reviewee_department text,
  anonymous boolean,
  response_id uuid,
  status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid;
  my_level int;
  my_sub uuid;
  eo uuid := '11111111-1111-1111-1111-111111111111';
  exec_form_id uuid;
  bunmi uuid;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN RETURN; END IF;

  SELECT e.hierarchy_level, e.subsidiary_id INTO my_level, my_sub
  FROM public.employees e WHERE e.id = me;

  SELECT id INTO exec_form_id FROM public.assessment_forms WHERE code = 'executive' LIMIT 1;
  SELECT id INTO bunmi FROM public.employees WHERE lower(email) = lower('bunmi.akinyemiju@peopleos.co') LIMIT 1;

  IF my_sub = eo THEN
    RETURN QUERY
    WITH peer_targets AS (
      SELECT e.id AS rid
      FROM public.employees e
      WHERE e.subsidiary_id = eo
        AND e.eo_appraisal_active
        AND public.boom_peer_360_allowed(me, e.id)
    ),
    targets AS (
      SELECT 'monthly_self'::text AS fc, me AS rid
      WHERE public.boom_monthly_self_allowed(me)
      UNION ALL
      SELECT 'peer_360', pt.rid FROM peer_targets pt
      UNION ALL
      SELECT 'executive', me
      WHERE public.boom_executive_self_allowed(me)
      UNION ALL
      SELECT 'ea_quarterly', e.id
      FROM public.eo_ea_quarterly_pairs p
      JOIN public.employees e ON e.id = p.reviewee_employee_id
      WHERE p.reviewer_employee_id = me
        AND p.review_mode = 'standard'
        AND e.eo_appraisal_active
      UNION ALL
      SELECT 'ea_quarterly', e.id
      FROM public.eo_ea_quarterly_pairs p
      JOIN public.employees e ON e.id = p.reviewee_employee_id
      WHERE p.reviewer_employee_id = me
        AND me = bunmi
        AND p.review_mode = 'epa_gceo'
        AND public.boom_bunmi_ea_quarterly_l1(e.id)
        AND e.eo_appraisal_active
      UNION ALL
      SELECT 'epa_gceo_assessor', e.id
      FROM public.eo_ea_quarterly_pairs p
      JOIN public.employees e ON e.id = p.reviewee_employee_id
      WHERE p.reviewer_employee_id = me
        AND p.review_mode = 'epa_gceo'
        AND e.eo_appraisal_active
    ),
    dedup AS (SELECT DISTINCT fc, rid FROM targets)
    SELECT
      f.code,
      CASE WHEN d.fc = 'epa_gceo_assessor' THEN 'Executive Performance Assessment (GCEO assessor)' ELSE f.title END,
      emp.id,
      emp.name,
      emp.role,
      emp.department,
      false,
      COALESCE(r.id, ar.id, sr.id),
      CASE
        WHEN d.fc = 'epa_gceo_assessor' THEN
          CASE
            WHEN ar.status = 'submitted' THEN 'submitted'
            WHEN ar.id IS NOT NULL THEN 'draft'
            WHEN sr.status = 'submitted' THEN 'todo'
            WHEN sr.id IS NOT NULL THEN 'waiting_self'
            ELSE 'waiting_self'
          END
        ELSE COALESCE(r.status, 'todo')
      END
    FROM dedup d
    JOIN public.assessment_forms f ON f.code = CASE WHEN d.fc = 'epa_gceo_assessor' THEN 'executive' ELSE d.fc END
    JOIN public.employees emp ON emp.id = d.rid
    LEFT JOIN LATERAL public.pick_visible_assessment_response(
      f.id,
      me,
      emp.id,
      CASE WHEN d.fc = 'monthly_self' THEN _period_month ELSE _period_quarter END,
      d.fc
    ) r ON d.fc <> 'epa_gceo_assessor'
    LEFT JOIN public.assessment_responses sr
      ON sr.form_id = exec_form_id AND sr.reviewee_id = emp.id AND sr.reviewer_id = emp.id
      AND sr.period = _period_quarter AND d.fc = 'epa_gceo_assessor'
    LEFT JOIN public.assessment_assessor_reviews ar
      ON ar.self_response_id = sr.id AND ar.assessor_employee_id = me AND d.fc = 'epa_gceo_assessor'
    ORDER BY f.code, emp.name;
    RETURN;
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT 'executive'::text AS assign_code, me AS rid
    WHERE public.boom_executive_self_allowed(me)
    UNION ALL
    SELECT 'peer_360', e.id FROM public.employees e
    WHERE EXISTS (SELECT 1 FROM public.employees x WHERE x.id = me AND x.manager_id IS NOT NULL AND e.id = x.manager_id)
    UNION ALL
    SELECT 'peer_360', e.id FROM public.employees e
    JOIN public.employees me_e ON me_e.id = me
    WHERE me_e.department IS NOT NULL AND e.department = me_e.department AND e.id <> me AND e.hierarchy_level >= my_level
    UNION ALL
    SELECT 'peer_360', e.id FROM public.employees e WHERE e.manager_id = me
    UNION ALL
    SELECT 'ea_quarterly', e.id FROM public.employees e
    WHERE e.manager_id = me AND e.role ILIKE '%Executive Assistant%'
    UNION ALL
    SELECT 'monthly_self', me
    WHERE public.boom_monthly_self_allowed(me)
  ),
  dedup AS (SELECT DISTINCT assign_code, rid FROM targets)
  SELECT
    f.code, f.title, e.id, e.name, e.role, e.department, f.anonymous, r.id, COALESCE(r.status, 'todo')
  FROM dedup d
  JOIN public.assessment_forms f ON f.code = d.assign_code
  JOIN public.employees e ON e.id = d.rid
  LEFT JOIN LATERAL public.pick_visible_assessment_response(
    f.id,
    me,
    e.id,
    CASE WHEN f.code = 'monthly_self' THEN _period_month ELSE _period_quarter END,
    f.code
  ) r ON true
  ORDER BY f.code, e.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_eo_ea_quarterly_status_roster(_period text)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  employee_role text,
  expected_reviewers int,
  submitted_count int,
  draft_count int,
  status text,
  submissions jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  my_level int;
  eo uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN RETURN; END IF;
  SELECT hierarchy_level INTO my_level FROM public.employees WHERE id = me;
  IF NOT (public.has_role(auth.uid(), 'admin') OR COALESCE(my_level, 99) <= 1) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT DISTINCT e.id, e.name, e.role
    FROM public.employees e
    JOIN public.eo_ea_quarterly_pairs p ON p.reviewee_employee_id = e.id
    WHERE e.subsidiary_id = eo
      AND e.eo_appraisal_active
      AND e.hierarchy_level = 2
      AND (
        public.has_role(auth.uid(), 'admin')
        OR COALESCE(my_level, 99) = 0
        OR (
          COALESCE(my_level, 99) = 1
          AND (
            public.boom_l1_has_company_directory(me)
            OR e.manager_id = me
            OR e.secondary_manager_id = me
          )
        )
      )
  ),
  expected AS (
    SELECT t.id AS reviewee_id, COUNT(*)::int AS n
    FROM targets t
    JOIN public.eo_ea_quarterly_pairs p ON p.reviewee_employee_id = t.id
    GROUP BY t.id
  ),
  resp AS (
    SELECT
      r.reviewee_id,
      COUNT(*) FILTER (WHERE r.status = 'submitted')::int AS submitted_n,
      COUNT(*) FILTER (WHERE r.status = 'draft')::int AS draft_n,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'reviewer_id', r.reviewer_id,
          'reviewer_name', rev.name,
          'status', r.status,
          'submitted_at', r.submitted_at,
          'avg_score', (
            SELECT ROUND(AVG(a.score)::numeric, 2)
            FROM public.assessment_answers a
            JOIN public.assessment_questions q ON q.id = a.question_id
            WHERE a.response_id = r.id
              AND a.score IS NOT NULL AND NOT a.no_opportunity AND q.question_type = 'scored'
          ),
          'score_pct', (
            SELECT ROUND((AVG(a.score)::numeric / 5) * 100, 0)
            FROM public.assessment_answers a
            JOIN public.assessment_questions q ON q.id = a.question_id
            WHERE a.response_id = r.id
              AND a.score IS NOT NULL AND NOT a.no_opportunity AND q.question_type = 'scored'
          )
        ) ORDER BY r.submitted_at DESC NULLS LAST
      ) FILTER (WHERE true), '[]'::jsonb) AS subs
    FROM public.assessment_responses r
    JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'ea_quarterly'
    JOIN public.employees rev ON rev.id = r.reviewer_id
    WHERE r.period = _period
      AND r.reviewee_id IN (SELECT id FROM targets)
    GROUP BY r.reviewee_id
  )
  SELECT
    t.id,
    t.name,
    t.role,
    COALESCE(ex.n, 0),
    COALESCE(rp.submitted_n, 0),
    COALESCE(rp.draft_n, 0),
    CASE
      WHEN COALESCE(rp.submitted_n, 0) > 0 THEN 'complete'
      WHEN COALESCE(rp.draft_n, 0) > 0 THEN 'in_progress'
      ELSE 'todo'
    END,
    COALESCE(rp.subs, '[]'::jsonb)
  FROM targets t
  LEFT JOIN expected ex ON ex.reviewee_id = t.id
  LEFT JOIN resp rp ON rp.reviewee_id = t.id
  ORDER BY t.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_eo_employee_insight(
  _employee_id uuid,
  _period_quarter text,
  _period_month text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  my_level int;
  target record;
  monthly_status text;
  exec_status text;
  peer_rows jsonb;
  peer_by_rel jsonb;
  released boolean;
  can_view boolean;
  can_view_360 boolean;
  ea_subs jsonb;
  ea_expected int;
  ea_submitted int;
  l1_can_see_target boolean;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT hierarchy_level INTO my_level FROM public.employees WHERE id = me;
  SELECT * INTO target FROM public.employees WHERE id = _employee_id;
  IF target.id IS NULL THEN RETURN '{}'::jsonb; END IF;

  l1_can_see_target := COALESCE(my_level, 99) = 1
    AND target.hierarchy_level = 2
    AND (
      public.boom_l1_has_company_directory(me)
      OR target.manager_id = me
      OR target.secondary_manager_id = me
    );

  can_view := public.has_role(auth.uid(), 'admin')
    OR me = _employee_id
    OR l1_can_see_target
    OR (COALESCE(my_level, 99) = 0 AND target.hierarchy_level <= 2);

  IF NOT can_view THEN RETURN '{}'::jsonb; END IF;

  can_view_360 := public.has_role(auth.uid(), 'admin')
    OR me = _employee_id
    OR l1_can_see_target
    OR (COALESCE(my_level, 99) = 0 AND target.hierarchy_level = 2);

  SELECT COALESCE(r.status, 'todo') INTO monthly_status
  FROM public.assessment_forms f
  LEFT JOIN public.assessment_responses r
    ON r.form_id = f.id AND r.reviewer_id = _employee_id AND r.reviewee_id = _employee_id
    AND r.period = _period_month
  WHERE f.code = 'monthly_self' LIMIT 1;

  SELECT COALESCE(r.status, 'todo') INTO exec_status
  FROM public.assessment_forms f
  LEFT JOIN public.assessment_responses r
    ON r.form_id = f.id AND r.reviewer_id = _employee_id AND r.reviewee_id = _employee_id
    AND r.period = _period_quarter
  WHERE f.code = 'executive' LIMIT 1;

  SELECT public.peer_360_results_released(_period_quarter) INTO released;

  IF can_view_360 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'section', section,
      'avg_score', avg_score,
      'response_count', response_count
    ) ORDER BY section), '[]'::jsonb) INTO peer_rows
    FROM (
      SELECT
        q.section,
        ROUND(AVG(a.score)::numeric, 2) AS avg_score,
        COUNT(a.score)::int AS response_count
      FROM public.assessment_answers a
      JOIN public.assessment_questions q ON q.id = a.question_id
      JOIN public.assessment_responses r ON r.id = a.response_id
      JOIN public.assessment_forms f ON f.id = r.form_id
      WHERE r.reviewee_id = _employee_id AND r.period = _period_quarter AND r.status = 'submitted'
        AND f.code = 'peer_360' AND a.score IS NOT NULL AND NOT a.no_opportunity
      GROUP BY q.section
    ) section_agg;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'relation', rel,
      'avg_score', avg_score,
      'response_count', response_count
    )), '[]'::jsonb) INTO peer_by_rel
    FROM (
      SELECT
        COALESCE(r.reviewer_relation, public.boom_reviewer_relation(r.reviewer_id, r.reviewee_id)) AS rel,
        ROUND(AVG(a.score)::numeric, 2) AS avg_score,
        COUNT(DISTINCT r.id)::int AS response_count
      FROM public.assessment_responses r
      JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'peer_360'
      JOIN public.assessment_answers a ON a.response_id = r.id AND a.score IS NOT NULL AND NOT a.no_opportunity
      WHERE r.reviewee_id = _employee_id AND r.period = _period_quarter AND r.status = 'submitted'
      GROUP BY rel
      HAVING COUNT(DISTINCT r.id) >= 1
    ) rel_agg;
  ELSE
    peer_rows := '[]'::jsonb;
    peer_by_rel := '[]'::jsonb;
  END IF;

  SELECT COUNT(*)::int INTO ea_expected
  FROM public.eo_ea_quarterly_pairs p
  WHERE p.reviewee_employee_id = _employee_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reviewer_id', r.reviewer_id,
    'reviewer_name', rev.name,
    'status', r.status,
    'submitted_at', r.submitted_at,
    'avg_score', (
      SELECT ROUND(AVG(a.score)::numeric, 2)
      FROM public.assessment_answers a
      JOIN public.assessment_questions q ON q.id = a.question_id
      WHERE a.response_id = r.id
        AND a.score IS NOT NULL AND NOT a.no_opportunity AND q.question_type = 'scored'
    ),
    'score_pct', (
      SELECT ROUND((AVG(a.score)::numeric / 5) * 100, 0)
      FROM public.assessment_answers a
      JOIN public.assessment_questions q ON q.id = a.question_id
      WHERE a.response_id = r.id
        AND a.score IS NOT NULL AND NOT a.no_opportunity AND q.question_type = 'scored'
    )
  ) ORDER BY r.submitted_at DESC NULLS LAST), '[]'::jsonb)
  INTO ea_subs
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'ea_quarterly'
  JOIN public.employees rev ON rev.id = r.reviewer_id
  WHERE r.reviewee_id = _employee_id AND r.period = _period_quarter;

  SELECT COUNT(*)::int INTO ea_submitted
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'ea_quarterly'
  WHERE r.reviewee_id = _employee_id AND r.period = _period_quarter AND r.status = 'submitted';

  RETURN jsonb_build_object(
    'employee_id', _employee_id,
    'name', target.name,
    'hierarchy_level', target.hierarchy_level,
    'monthly_self_status', monthly_status,
    'executive_self_status', exec_status,
    'peer_360_released', COALESCE(released, false),
    'peer_360_sections', COALESCE(peer_rows, '[]'::jsonb),
    'peer_360_by_relation', COALESCE(peer_by_rel, '[]'::jsonb),
    'can_view_360', can_view_360,
    'ea_quarterly_expected', COALESCE(ea_expected, 0),
    'ea_quarterly_submitted', COALESCE(ea_submitted, 0),
    'ea_quarterly_status', CASE
      WHEN COALESCE(ea_submitted, 0) > 0 THEN 'complete'
      WHEN EXISTS (
        SELECT 1 FROM public.assessment_responses r
        JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'ea_quarterly'
        WHERE r.reviewee_id = _employee_id AND r.period = _period_quarter AND r.status = 'draft'
      ) THEN 'in_progress'
      ELSE 'todo'
    END,
    'ea_quarterly_submissions', COALESCE(ea_subs, '[]'::jsonb)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
