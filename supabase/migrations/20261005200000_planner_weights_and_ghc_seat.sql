-- Priority-weighted planner completion for every company, and Omotola's
-- GHC reviews sit on her GreenHouse Capital seat so Anjola's manager
-- tasks open there.

UPDATE public.employees seat
SET
  ghc_appraisal_active = true,
  ghc_hierarchy_level = old.ghc_hierarchy_level,
  ghc_manager_id = old.ghc_manager_id,
  company_admin = true
FROM public.employees old
WHERE lower(seat.email) = lower('omotola.akinyemiju@greenhouse.capital')
  AND lower(old.email) = lower('omotola.akinyemiju@venturegardengroup.com');

UPDATE public.employees report
SET ghc_manager_id = seat.id
FROM public.employees seat, public.employees old
WHERE lower(seat.email) = lower('omotola.akinyemiju@greenhouse.capital')
  AND lower(old.email) = lower('omotola.akinyemiju@venturegardengroup.com')
  AND report.ghc_manager_id = old.id;

UPDATE public.employees report
SET ghc_secondary_manager_id = seat.id
FROM public.employees seat, public.employees old
WHERE lower(seat.email) = lower('omotola.akinyemiju@greenhouse.capital')
  AND lower(old.email) = lower('omotola.akinyemiju@venturegardengroup.com')
  AND report.ghc_secondary_manager_id = old.id;

UPDATE public.employees
SET ghc_appraisal_active = false
WHERE lower(email) = lower('omotola.akinyemiju@venturegardengroup.com');

CREATE OR REPLACE FUNCTION public.workspace_priority_weight(_priority text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(_priority, 'medium'))
    WHEN 'critical' THEN 4
    WHEN 'high' THEN 3
    WHEN 'low' THEN 1
    ELSE 2
  END;
$$;

COMMENT ON FUNCTION public.workspace_priority_weight(text) IS
  'Shared planner weight. Critical work counts more than low-priority work. The same rule applies in every company.';


CREATE OR REPLACE FUNCTION public.workspace_key_result_progress(_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE((
    SELECT ROUND(
      SUM((public.workspace_project_analysis(p.id)->>'progress_pct')::numeric * public.workspace_priority_weight(p.priority))
      / NULLIF(SUM(public.workspace_priority_weight(p.priority)), 0)
    )::int
    FROM public.workspace_projects p
    WHERE p.key_result_id = _id
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.workspace_unit_progress(_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE((
    SELECT ROUND(
      SUM(public.workspace_key_result_progress(k.id) * public.workspace_priority_weight(k.priority))
      / NULLIF(SUM(public.workspace_priority_weight(k.priority)), 0)
    )::int
    FROM public.workspace_key_results k
    WHERE k.unit_objective_id = _id
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.workspace_company_progress(_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE((
    SELECT ROUND(SUM(child.pct * child.weight) / NULLIF(SUM(child.weight), 0))::int
    FROM (
      SELECT public.workspace_unit_progress(u.id)::numeric AS pct,
             public.workspace_priority_weight(u.priority) AS weight
      FROM public.workspace_objectives u
      WHERE u.parent_id = _id
      UNION ALL
      SELECT public.workspace_key_result_progress(k.id)::numeric,
             public.workspace_priority_weight(k.priority)
      FROM public.workspace_key_results k
      WHERE k.company_objective_id = _id
        AND k.unit_objective_id IS NULL
    ) child
  ), 0);
$$;

GRANT EXECUTE ON FUNCTION public.workspace_priority_weight(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_company_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.workspace_project_analysis(_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH tasks AS (
    SELECT
      t.id,
      t.title,
      t.flow_state,
      t.cruciality,
      t.waiting_on,
      t.assignee_id,
      ae.name AS assignee_name,
      public.workspace_working_days(t.flow_changed_at, now()) AS wait_days,
      CASE t.cruciality
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END AS crucial_rank
    FROM public.workspace_tasks t
    JOIN public.employees ae ON ae.id = t.assignee_id
    WHERE t.project_id = _project_id
       OR EXISTS (
         SELECT 1 FROM public.workspace_task_projects x
         WHERE x.task_id = t.id AND x.project_id = _project_id
       )
  ),
  counted AS (
    SELECT
      count(*) FILTER (WHERE flow_state <> 'cancelled')::int AS task_count,
      count(*) FILTER (WHERE flow_state = 'done')::int AS done_count,
      COALESCE(SUM(public.workspace_priority_weight(cruciality)) FILTER (WHERE flow_state <> 'cancelled'), 0)::numeric AS weight_total,
      COALESCE(SUM(public.workspace_priority_weight(cruciality)) FILTER (WHERE flow_state = 'done'), 0)::numeric AS weight_done,
      count(*) FILTER (WHERE flow_state NOT IN ('done', 'cancelled'))::int AS remaining_count,
      count(*) FILTER (
        WHERE flow_state IN ('waiting_internal', 'waiting_external', 'waiting_decision', 'waiting_dependency', 'review')
      )::int AS waiting_count,
      count(*) FILTER (
        WHERE flow_state NOT IN ('done', 'cancelled') AND cruciality IN ('high', 'critical')
      )::int AS crucial_count,
      COALESCE(max(wait_days) FILTER (
        WHERE flow_state IN ('waiting_internal', 'waiting_external', 'waiting_decision', 'waiting_dependency', 'review')
      ), 0)::int AS oldest_wait_days
    FROM tasks
  )
  SELECT jsonb_build_object(
    'progress_pct', CASE
      WHEN counted.weight_total = 0 THEN 0
      ELSE ROUND(100.0 * counted.weight_done / counted.weight_total)::int
    END,
    'task_count', counted.task_count,
    'done_count', counted.done_count,
    'remaining_count', counted.remaining_count,
    'waiting_count', counted.waiting_count,
    'crucial_count', counted.crucial_count,
    'oldest_wait_days', counted.oldest_wait_days,
    'crucial_remaining', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'flow_state', c.flow_state,
        'cruciality', c.cruciality,
        'assignee_name', c.assignee_name,
        'waiting_on', c.waiting_on,
        'wait_days', c.wait_days
      ) ORDER BY c.crucial_rank, c.wait_days DESC, c.title)
      FROM (
        SELECT * FROM tasks
        WHERE flow_state NOT IN ('done', 'cancelled')
          AND cruciality IN ('high', 'critical')
        ORDER BY crucial_rank, wait_days DESC, title
        LIMIT 8
      ) c
    ), '[]'::jsonb)
  )
  FROM counted;
$$;


CREATE OR REPLACE FUNCTION public.workspace_get_planner()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
  v_period text := public.workspace_current_period();
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;

  RETURN jsonb_build_object(
    'period', v_period,
    'can_manage_objectives', public.workspace_can_manage_objectives(),
    'is_leadership', public.workspace_is_leadership(),
    'objectives_locked', EXISTS (
      SELECT 1 FROM public.workspace_objectives o
      WHERE o.subsidiary_id = sid AND o.period = v_period AND o.locked
    ),
    'company_objectives', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'title', o.title,
        'priority', o.priority,
        'status', o.status,
        'due_date', o.due_date,
        'locked', o.locked,
        'progress_pct', public.workspace_company_progress(o.id),
        'child_count', (
          SELECT count(*) FROM public.workspace_objectives u WHERE u.parent_id = o.id
        )
      ) ORDER BY o.due_date NULLS LAST, o.title)
      FROM public.workspace_objectives o
      WHERE o.subsidiary_id = sid AND o.level = 'company' AND o.period = v_period
    ), '[]'::jsonb),
    'unit_objectives', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'parent_id', o.parent_id,
        'parent_title', p.title,
        'title', o.title,
        'priority', o.priority,
        'status', o.status,
        'due_date', o.due_date,
        'locked', o.locked,
        'progress_pct', public.workspace_unit_progress(o.id),
        'child_count', (
          SELECT count(*) FROM public.workspace_key_results k WHERE k.unit_objective_id = o.id
        )
      ) ORDER BY o.due_date NULLS LAST, o.title)
      FROM public.workspace_objectives o
      JOIN public.workspace_objectives p ON p.id = o.parent_id
      WHERE o.subsidiary_id = sid AND o.level = 'unit' AND o.period = v_period
    ), '[]'::jsonb),
    'key_results', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', k.id,
        'title', k.title,
        'owner_id', k.owner_id,
        'owner_name', e.name,
        'company_objective_id', k.company_objective_id,
        'unit_objective_id', k.unit_objective_id,
        'parent_title', COALESCE(u.title, c.title),
        'priority', k.priority,
        'status', k.status,
        'due_date', k.due_date,
        'progress_pct', public.workspace_key_result_progress(k.id),
        'project_count', (SELECT count(*) FROM public.workspace_projects p WHERE p.key_result_id = k.id),
        'task_count', (
          SELECT count(*) FROM public.workspace_tasks t
          JOIN public.workspace_projects p ON p.id = t.project_id
          WHERE p.key_result_id = k.id AND t.flow_state <> 'cancelled'
        ),
        'can_edit', k.owner_id = me OR public.workspace_is_leadership() OR me IN (e.manager_id, e.ghc_manager_id)
      ) ORDER BY e.name, k.title)
      FROM public.workspace_key_results k
      JOIN public.employees e ON e.id = k.owner_id
      LEFT JOIN public.workspace_objectives u ON u.id = k.unit_objective_id
      LEFT JOIN public.workspace_objectives c ON c.id = k.company_objective_id
      WHERE k.subsidiary_id = sid AND k.period = v_period
        AND (
          k.owner_id = me
          OR public.workspace_is_leadership()
          OR me IN (e.manager_id, e.ghc_manager_id)
        )
    ), '[]'::jsonb),
    'project_links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'key_result_id', p.key_result_id
      ))
      FROM public.workspace_projects p
      WHERE p.subsidiary_id = sid AND public.workspace_project_visible(p.id)
    ), '[]'::jsonb),
    'tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'project_id', t.project_id,
        'project_name', p.name,
        'also_on', COALESCE((
          SELECT jsonb_agg(op.name ORDER BY op.name)
          FROM public.workspace_task_projects x
          JOIN public.workspace_projects op ON op.id = x.project_id
          WHERE x.task_id = t.id AND x.project_id <> t.project_id
        ), '[]'::jsonb),
        'key_result_title', kr.title,
        'assignee_name', ae.name,
        'due_date', t.due_date,
        'priority', t.cruciality,
        'status', CASE
          WHEN t.flow_state = 'done' THEN 'done'
          WHEN t.flow_state = 'ready' THEN 'not_started'
          WHEN t.flow_state IN ('waiting_internal', 'waiting_external', 'waiting_decision', 'waiting_dependency') THEN 'blocked'
          WHEN t.flow_state = 'cancelled' THEN 'cancelled'
          ELSE 'in_progress'
        END,
        'next_action', COALESCE(NULLIF(btrim(t.last_movement), ''), NULLIF(btrim(t.waiting_on), ''))
      ) ORDER BY t.due_date NULLS LAST, t.title)
      FROM public.workspace_tasks t
      JOIN public.workspace_projects p ON p.id = t.project_id
      JOIN public.employees ae ON ae.id = t.assignee_id
      LEFT JOIN public.workspace_key_results kr ON kr.id = p.key_result_id
      WHERE p.subsidiary_id = sid
        AND public.workspace_project_visible(p.id)
    ), '[]'::jsonb)
  );
END;
$$;

