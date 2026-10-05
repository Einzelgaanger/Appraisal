-- Baluku Dounnah is the line manager for Chukwuka, Melissa, and Regina.
-- Hierarchy 1 is the manager view (directory, discussions, team pulse).
-- Company-wide L2 directory stays with the existing functional leads.
-- Baluku's directory and insight stay limited to direct reports.
-- Baluku still reports to Uche.

CREATE OR REPLACE FUNCTION public.boom_l1_has_company_directory(_viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = _viewer
      AND e.department_code IN ('l1_uche', 'l1_gisele', 'l1_omotola', 'l1_deyi')
  );
$$;

COMMENT ON FUNCTION public.boom_l1_has_company_directory(uuid) IS
  'True for the original L1 functional leads, who see the full L2 directory. Other L1 managers see only their direct reports.';

GRANT EXECUTE ON FUNCTION public.boom_l1_has_company_directory(uuid) TO authenticated;

UPDATE public.employees
SET
  hierarchy_level = 1,
  appraisal_self_performance = false,
  appraisal_gives_comments = false
WHERE subsidiary_id = '11111111-1111-1111-1111-111111111111'
  AND lower(email) = lower('baluku.dounnah@venturegardengroup.com');

UPDATE public.profiles p
SET hierarchy_level = 1
FROM public.employees e
WHERE e.subsidiary_id = '11111111-1111-1111-1111-111111111111'
  AND lower(e.email) = lower('baluku.dounnah@venturegardengroup.com')
  AND (
    p.employee_id = e.id
    OR lower(p.email) = lower(e.email)
  );

UPDATE public.employees report
SET
  manager_id = baluku.id,
  secondary_manager_id = NULL
FROM public.employees baluku
WHERE baluku.subsidiary_id = '11111111-1111-1111-1111-111111111111'
  AND lower(baluku.email) = lower('baluku.dounnah@venturegardengroup.com')
  AND report.subsidiary_id = baluku.subsidiary_id
  AND lower(report.email) IN (
    lower('chukwuka.monyei@venturegardengroup.com'),
    lower('melissa.omede@venturegardengroup.com'),
    lower('regina.ottoh-ebhonu@venturegardengroup.com')
  );

INSERT INTO public.eo_ea_quarterly_pairs (reviewer_employee_id, reviewee_employee_id, review_mode)
SELECT baluku.id, report.id, 'standard'
FROM public.employees baluku
JOIN public.employees report
  ON report.subsidiary_id = baluku.subsidiary_id
 AND lower(report.email) IN (
    lower('chukwuka.monyei@venturegardengroup.com'),
    lower('melissa.omede@venturegardengroup.com'),
    lower('regina.ottoh-ebhonu@venturegardengroup.com')
  )
WHERE baluku.subsidiary_id = '11111111-1111-1111-1111-111111111111'
  AND lower(baluku.email) = lower('baluku.dounnah@venturegardengroup.com')
ON CONFLICT (reviewer_employee_id, reviewee_employee_id)
DO UPDATE SET review_mode = 'standard';

CREATE OR REPLACE FUNCTION public.get_eo_directory_roster()
RETURNS TABLE (
  employee_id uuid,
  name text,
  email text,
  role text,
  department text,
  department_code text,
  manager_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  my_level int;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN RETURN; END IF;

  SELECT e.hierarchy_level INTO my_level FROM public.employees e WHERE e.id = me;
  IF my_level IS NULL OR my_level > 1 THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN RETURN; END IF;
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin') OR COALESCE(my_level, 99) <= 1) THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.id, e.name, e.email, e.role, e.department, e.department_code, m.name
  FROM public.employees e
  LEFT JOIN public.employees m ON m.id = e.manager_id
  WHERE e.subsidiary_id = '11111111-1111-1111-1111-111111111111'
    AND e.hierarchy_level = 2
    AND e.eo_appraisal_active
    AND (
      public.has_role(auth.uid(), 'admin')
      OR COALESCE(my_level, 99) = 0
      OR public.boom_l1_has_company_directory(me)
      OR e.manager_id = me
      OR e.secondary_manager_id = me
    )
  ORDER BY e.department_code, e.name;
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
      WHEN COALESCE(rp.submitted_n, 0) >= COALESCE(ex.n, 0) AND COALESCE(ex.n, 0) > 0 THEN 'complete'
      WHEN COALESCE(rp.submitted_n, 0) > 0 THEN 'partial'
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
      WHEN COALESCE(ea_expected, 0) > 0 AND COALESCE(ea_submitted, 0) >= ea_expected THEN 'complete'
      WHEN COALESCE(ea_submitted, 0) > 0 THEN 'partial'
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
