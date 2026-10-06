-- Close the remaining planner and leave gaps.
-- Completion uses a stored weight when one has been suggested, otherwise priority
-- (critical 4, high 3, medium 2, low 1). Partial task progress counts.
-- Company and unit objectives lock themselves after week 2 of the quarter.
-- Projects keep a status separate from the completion percentage.
-- HR can place or move another person's leave after the submit window.

ALTER TABLE public.workspace_projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'not_started';

ALTER TABLE public.workspace_projects
  DROP CONSTRAINT IF EXISTS workspace_projects_status_check;
ALTER TABLE public.workspace_projects
  ADD CONSTRAINT workspace_projects_status_check
  CHECK (status IN ('not_started', 'in_progress', 'done', 'blocked'));

ALTER TABLE public.workspace_tasks
  ADD COLUMN IF NOT EXISTS weight int;
ALTER TABLE public.workspace_projects
  ADD COLUMN IF NOT EXISTS weight int;
ALTER TABLE public.workspace_key_results
  ADD COLUMN IF NOT EXISTS weight int;
ALTER TABLE public.workspace_objectives
  ADD COLUMN IF NOT EXISTS weight int;

ALTER TABLE public.workspace_tasks
  DROP CONSTRAINT IF EXISTS workspace_tasks_weight_check;
ALTER TABLE public.workspace_tasks
  ADD CONSTRAINT workspace_tasks_weight_check
  CHECK (weight IS NULL OR weight BETWEEN 1 AND 6);

ALTER TABLE public.workspace_projects
  DROP CONSTRAINT IF EXISTS workspace_projects_weight_check;
ALTER TABLE public.workspace_projects
  ADD CONSTRAINT workspace_projects_weight_check
  CHECK (weight IS NULL OR weight BETWEEN 1 AND 6);

ALTER TABLE public.workspace_key_results
  DROP CONSTRAINT IF EXISTS workspace_key_results_weight_check;
ALTER TABLE public.workspace_key_results
  ADD CONSTRAINT workspace_key_results_weight_check
  CHECK (weight IS NULL OR weight BETWEEN 1 AND 6);

ALTER TABLE public.workspace_objectives
  DROP CONSTRAINT IF EXISTS workspace_objectives_weight_check;
ALTER TABLE public.workspace_objectives
  ADD CONSTRAINT workspace_objectives_weight_check
  CHECK (weight IS NULL OR weight BETWEEN 1 AND 6);

CREATE TABLE IF NOT EXISTS public.workspace_planner_periods (
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE,
  period text NOT NULL,
  lock_on date NOT NULL,
  override text CHECK (override IS NULL OR override IN ('locked', 'open')),
  PRIMARY KEY (subsidiary_id, period)
);

ALTER TABLE public.workspace_planner_periods ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.workspace_period_start(_period text)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _period ~ '^[0-9]{4}-Q[1-4]$' THEN make_date(
      substring(_period from 1 for 4)::int,
      ((substring(_period from 7 for 1)::int - 1) * 3) + 1,
      1
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_item_weight(_stored int, _priority text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _stored BETWEEN 1 AND 6 THEN _stored
    ELSE public.workspace_priority_weight(_priority)
  END;
$$;

COMMENT ON FUNCTION public.workspace_item_weight(int, text) IS
  'Planner completion weight. A suggested weight wins. Otherwise priority sets it: critical 4, high 3, medium 2, low 1.';

CREATE OR REPLACE FUNCTION public.workspace_objectives_are_locked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN p.override = 'locked' THEN true
      WHEN p.override = 'open' THEN false
      ELSE (now() AT TIME ZONE 'Africa/Lagos')::date > COALESCE(
        p.lock_on,
        public.workspace_period_start(public.workspace_current_period()) + 13
      )
    END
    FROM (SELECT 1) seed
    LEFT JOIN public.workspace_planner_periods p
      ON p.subsidiary_id = public.workspace_my_subsidiary_id()
     AND p.period = public.workspace_current_period()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.workspace_planner_lock_on()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    (
      SELECT p.lock_on
      FROM public.workspace_planner_periods p
      WHERE p.subsidiary_id = public.workspace_my_subsidiary_id()
        AND p.period = public.workspace_current_period()
    ),
    public.workspace_period_start(public.workspace_current_period()) + 13
  );
$$;

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
      t.progress,
      t.waiting_on,
      t.assignee_id,
      ae.name AS assignee_name,
      public.workspace_working_days(t.flow_changed_at, now()) AS wait_days,
      public.workspace_item_weight(t.weight, t.cruciality) AS item_weight,
      CASE
        WHEN t.flow_state = 'done' THEN 100
        ELSE LEAST(100, GREATEST(0, COALESCE(t.progress, 0)))
      END AS item_pct,
      CASE t.cruciality
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END AS crucial_rank
    FROM public.workspace_tasks t
    JOIN public.employees ae ON ae.id = t.assignee_id
    WHERE t.flow_state <> 'cancelled'
      AND (
        t.project_id = _project_id
        OR EXISTS (
          SELECT 1 FROM public.workspace_task_projects x
          WHERE x.task_id = t.id AND x.project_id = _project_id
        )
      )
  ),
  counted AS (
    SELECT
      count(*)::int AS task_count,
      count(*) FILTER (WHERE flow_state = 'done')::int AS done_count,
      COALESCE(SUM(item_weight), 0)::numeric AS weight_total,
      COALESCE(SUM(item_weight * item_pct), 0)::numeric AS weight_points,
      count(*) FILTER (WHERE flow_state <> 'done')::int AS remaining_count,
      count(*) FILTER (
        WHERE flow_state IN ('waiting_internal', 'waiting_external', 'waiting_decision', 'waiting_dependency', 'review')
      )::int AS waiting_count,
      count(*) FILTER (
        WHERE flow_state <> 'done' AND cruciality IN ('high', 'critical')
      )::int AS crucial_count,
      COALESCE(max(wait_days) FILTER (
        WHERE flow_state IN ('waiting_internal', 'waiting_external', 'waiting_decision', 'waiting_dependency', 'review')
      ), 0)::int AS oldest_wait_days
    FROM tasks
  )
  SELECT jsonb_build_object(
    'progress_pct', CASE
      WHEN counted.weight_total = 0 THEN 0
      ELSE ROUND(counted.weight_points / counted.weight_total)::int
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
        WHERE flow_state <> 'done'
          AND cruciality IN ('high', 'critical')
        ORDER BY crucial_rank, wait_days DESC, title
        LIMIT 8
      ) c
    ), '[]'::jsonb)
  )
  FROM counted;
$$;

CREATE OR REPLACE FUNCTION public.workspace_key_result_progress(_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE((
    SELECT ROUND(
      SUM((public.workspace_project_analysis(p.id)->>'progress_pct')::numeric * public.workspace_item_weight(p.weight, p.priority))
      / NULLIF(SUM(public.workspace_item_weight(p.weight, p.priority)), 0)
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
      SUM(public.workspace_key_result_progress(k.id) * public.workspace_item_weight(k.weight, k.priority))
      / NULLIF(SUM(public.workspace_item_weight(k.weight, k.priority)), 0)
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
             public.workspace_item_weight(u.weight, u.priority) AS weight
      FROM public.workspace_objectives u
      WHERE u.parent_id = _id
      UNION ALL
      SELECT public.workspace_key_result_progress(k.id)::numeric,
             public.workspace_item_weight(k.weight, k.priority)
      FROM public.workspace_key_results k
      WHERE k.company_objective_id = _id
        AND k.unit_objective_id IS NULL
    ) child
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.workspace_lock_objectives(_locked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  sid uuid := public.workspace_my_subsidiary_id();
  v_period text := public.workspace_current_period();
  v_lock date := public.workspace_period_start(v_period) + 13;
BEGIN
  IF NOT public.workspace_is_leadership() THEN
    RAISE EXCEPTION 'Only company leadership can lock the quarter.';
  END IF;
  INSERT INTO public.workspace_planner_periods (subsidiary_id, period, lock_on, override)
  VALUES (sid, v_period, v_lock, CASE WHEN COALESCE(_locked, false) THEN 'locked' ELSE 'open' END)
  ON CONFLICT (subsidiary_id, period) DO UPDATE
    SET override = EXCLUDED.override;
  UPDATE public.workspace_objectives
  SET locked = COALESCE(_locked, false), updated_at = now()
  WHERE subsidiary_id = sid AND period = v_period;
END;
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
    'objectives_locked', public.workspace_objectives_are_locked(),
    'lock_on', public.workspace_planner_lock_on(),
    'company_objectives', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'title', o.title,
        'priority', o.priority,
        'status', o.status,
        'due_date', o.due_date,
        'locked', public.workspace_objectives_are_locked(),
        'weight', public.workspace_item_weight(o.weight, o.priority),
        'weight_set', o.weight IS NOT NULL,
        'progress_pct', public.workspace_company_progress(o.id),
        'child_count', (SELECT count(*) FROM public.workspace_objectives u WHERE u.parent_id = o.id),
        'child_titles', COALESCE((
          SELECT jsonb_agg(u.title ORDER BY u.title)
          FROM public.workspace_objectives u
          WHERE u.parent_id = o.id
        ), '[]'::jsonb)
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
        'locked', public.workspace_objectives_are_locked(),
        'weight', public.workspace_item_weight(o.weight, o.priority),
        'weight_set', o.weight IS NOT NULL,
        'progress_pct', public.workspace_unit_progress(o.id),
        'child_count', (SELECT count(*) FROM public.workspace_key_results k WHERE k.unit_objective_id = o.id),
        'child_titles', COALESCE((
          SELECT jsonb_agg(k.title ORDER BY k.title)
          FROM public.workspace_key_results k
          WHERE k.unit_objective_id = o.id
        ), '[]'::jsonb)
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
        'weight', public.workspace_item_weight(k.weight, k.priority),
        'weight_set', k.weight IS NOT NULL,
        'progress_pct', public.workspace_key_result_progress(k.id),
        'project_count', (SELECT count(*) FROM public.workspace_projects p WHERE p.key_result_id = k.id),
        'task_count', (
          SELECT count(DISTINCT t.id)
          FROM public.workspace_tasks t
          JOIN public.workspace_projects p ON p.key_result_id = k.id
          WHERE t.flow_state <> 'cancelled'
            AND (
              t.project_id = p.id
              OR EXISTS (
                SELECT 1 FROM public.workspace_task_projects x
                WHERE x.task_id = t.id AND x.project_id = p.id
              )
            )
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
        'key_result_id', p.key_result_id,
        'priority', p.priority,
        'status', p.status,
        'weight', public.workspace_item_weight(p.weight, p.priority)
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
          SELECT jsonb_agg(jsonb_build_object('id', op.id, 'name', op.name) ORDER BY op.name)
          FROM public.workspace_task_projects x
          JOIN public.workspace_projects op ON op.id = x.project_id
          WHERE x.task_id = t.id AND x.project_id <> t.project_id
        ), '[]'::jsonb),
        'key_result_title', kr.title,
        'assignee_name', ae.name,
        'due_date', t.due_date,
        'priority', t.cruciality,
        'weight', public.workspace_item_weight(t.weight, t.cruciality),
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
      WHERE (
        public.workspace_project_visible(p.id)
        OR EXISTS (
          SELECT 1 FROM public.workspace_task_projects x
          WHERE x.task_id = t.id AND public.workspace_project_visible(x.project_id)
        )
      )
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_list_projects()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_ts DESC)
    FROM (
      SELECT
        p.id,
        p.name,
        p.description,
        p.due_date,
        p.created_at,
        p.created_by,
        p.priority,
        p.status,
        public.workspace_item_weight(p.weight, p.priority) AS weight,
        p.key_result_id,
        kr.title AS key_result_title,
        COALESCE(m.role, 'viewer') AS my_role,
        COALESCE(m.status, 'active') AS my_status,
        CASE
          WHEN m.employee_id IS NOT NULL THEN 'member'
          WHEN public.workspace_is_line_manager(p.id) THEN 'line_manager'
          ELSE 'leadership'
        END AS view_reason,
        COALESCE(m.status = 'active', false) AS can_edit,
        owner.employee_id AS owner_id,
        oe.name AS owner_name,
        (a.analysis->>'progress_pct')::int AS progress_pct,
        (a.analysis->>'task_count')::int AS task_count,
        (a.analysis->>'done_count')::int AS done_count,
        (a.analysis->>'remaining_count')::int AS remaining_count,
        (a.analysis->>'waiting_count')::int AS waiting_count,
        (a.analysis->>'crucial_count')::int AS crucial_count,
        (a.analysis->>'oldest_wait_days')::int AS oldest_wait_days,
        a.analysis->'crucial_remaining' AS crucial_remaining,
        (SELECT COUNT(*)::int FROM public.workspace_project_members mm WHERE mm.project_id = p.id AND mm.status = 'active') AS member_count,
        GREATEST(p.updated_at, COALESCE(m.created_at, p.created_at)) AS sort_ts
      FROM public.workspace_projects p
      LEFT JOIN public.workspace_key_results kr ON kr.id = p.key_result_id
      LEFT JOIN public.workspace_project_members m
        ON m.project_id = p.id AND m.employee_id = me AND m.status IN ('invited', 'active')
      LEFT JOIN public.workspace_project_members owner
        ON owner.project_id = p.id AND owner.role = 'owner' AND owner.status = 'active'
      LEFT JOIN public.employees oe ON oe.id = owner.employee_id
      CROSS JOIN LATERAL (
        SELECT public.workspace_project_analysis(p.id) AS analysis
      ) a
      WHERE p.subsidiary_id = public.workspace_my_subsidiary_id()
        AND public.workspace_project_visible(p.id)
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_get_project(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  analysis jsonb;
  can_edit boolean;
  view_reason text;
BEGIN
  IF NOT public.workspace_project_visible(_project_id) THEN
    RAISE EXCEPTION 'Project not found.';
  END IF;

  analysis := public.workspace_project_analysis(_project_id);
  SELECT (m.status = 'active') INTO can_edit
  FROM public.workspace_project_members m
  WHERE m.project_id = _project_id AND m.employee_id = me AND m.status IN ('invited', 'active');
  can_edit := COALESCE(can_edit, false);

  view_reason := CASE
    WHEN EXISTS (
      SELECT 1 FROM public.workspace_project_members m
      WHERE m.project_id = _project_id AND m.employee_id = me AND m.status IN ('invited', 'active')
    ) THEN 'member'
    WHEN public.workspace_is_line_manager(_project_id) THEN 'line_manager'
    ELSE 'leadership'
  END;

  RETURN jsonb_build_object(
    'project', (
      SELECT jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'due_date', p.due_date,
        'priority', p.priority,
        'status', p.status,
        'weight', public.workspace_item_weight(p.weight, p.priority),
        'created_at', p.created_at,
        'created_by', p.created_by
      ) || analysis
      FROM public.workspace_projects p
      WHERE p.id = _project_id
    ),
    'my_membership', (
      SELECT jsonb_build_object(
        'role', COALESCE(m.role, 'viewer'),
        'status', COALESCE(m.status, 'active'),
        'can_edit', can_edit,
        'view_reason', view_reason
      )
      FROM (SELECT 1) seed
      LEFT JOIN public.workspace_project_members m
        ON m.project_id = _project_id AND m.employee_id = me AND m.status IN ('invited', 'active')
    ),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'employee_id', m.employee_id,
        'name', e.name,
        'role', m.role,
        'status', m.status,
        'email', e.email
      ) ORDER BY m.role, e.name)
      FROM public.workspace_project_members m
      JOIN public.employees e ON e.id = m.employee_id
      WHERE m.project_id = _project_id AND m.status IN ('invited', 'active')
    ), '[]'::jsonb),
    'tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'notes', t.notes,
        'created_by', t.created_by,
        'assignee_id', t.assignee_id,
        'assignee_name', ae.name,
        'due_date', t.due_date,
        'progress', t.progress,
        'status', t.status,
        'flow_state', t.flow_state,
        'cruciality', t.cruciality,
        'weight', public.workspace_item_weight(t.weight, t.cruciality),
        'waiting_on', t.waiting_on,
        'last_movement', t.last_movement,
        'blocked_on_task_id', t.blocked_on_task_id,
        'shared', t.project_id <> _project_id,
        'wait_days', public.workspace_working_days(t.flow_changed_at, now()),
        'pending_delegation', (
          SELECT jsonb_build_object(
            'id', d.id,
            'to_employee_id', d.to_employee_id,
            'to_name', de.name,
            'from_employee_id', d.from_employee_id
          )
          FROM public.workspace_task_delegations d
          JOIN public.employees de ON de.id = d.to_employee_id
          WHERE d.task_id = t.id AND d.status = 'pending'
          LIMIT 1
        )
      ) ORDER BY
        CASE t.cruciality WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        CASE WHEN t.flow_state IN ('done', 'cancelled') THEN 1 ELSE 0 END,
        t.due_date NULLS LAST,
        t.created_at)
      FROM public.workspace_tasks t
      JOIN public.employees ae ON ae.id = t.assignee_id
      WHERE t.project_id = _project_id
         OR EXISTS (
           SELECT 1 FROM public.workspace_task_projects x
           WHERE x.task_id = t.id AND x.project_id = _project_id
         )
    ), '[]'::jsonb),
    'activity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id,
        'action', l.action,
        'detail', l.detail,
        'created_at', l.created_at,
        'actor_id', l.actor_id,
        'actor_name', a.name
      ) ORDER BY l.created_at DESC)
      FROM (
        SELECT * FROM public.workspace_activity_logs
        WHERE project_id = _project_id
        ORDER BY created_at DESC
        LIMIT 80
      ) l
      JOIN public.employees a ON a.id = l.actor_id
    ), '[]'::jsonb)
  );
END;
$$;

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
  priority text := lower(btrim(COALESCE(_priority, 'medium')));
  status text := lower(btrim(COALESCE(_status, 'not_started')));
BEGIN
  IF NOT public.workspace_project_active(_project_id) THEN
    RAISE EXCEPTION 'You are not on this project.';
  END IF;
  IF priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Choose a priority.';
  END IF;
  IF status NOT IN ('not_started', 'in_progress', 'done', 'blocked') THEN
    RAISE EXCEPTION 'Choose a status.';
  END IF;
  UPDATE public.workspace_projects
  SET priority = priority, status = status, updated_at = now()
  WHERE id = _project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_apply_weights(_items jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
  item jsonb;
  applied int := 0;
  lvl text;
  wid uuid;
  w int;
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'Choose the items to weigh.';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    lvl := lower(COALESCE(item->>'level', ''));
    BEGIN
      wid := NULLIF(item->>'id', '')::uuid;
      w := (item->>'weight')::int;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF wid IS NULL OR w IS NULL OR w < 1 OR w > 6 THEN
      CONTINUE;
    END IF;

    IF lvl = 'objective' THEN
      UPDATE public.workspace_objectives o
      SET weight = w, updated_at = now()
      WHERE o.id = wid
        AND o.subsidiary_id = sid
        AND public.workspace_can_manage_objectives()
        AND (NOT public.workspace_objectives_are_locked() OR public.workspace_is_leadership())
        AND (o.level <> 'company' OR public.workspace_is_leadership());
    ELSIF lvl = 'key_result' THEN
      UPDATE public.workspace_key_results k
      SET weight = w, updated_at = now()
      WHERE k.id = wid
        AND k.subsidiary_id = sid
        AND (
          k.owner_id = me
          OR public.workspace_is_leadership()
          OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = k.owner_id AND me IN (e.manager_id, e.ghc_manager_id)
          )
        );
    ELSIF lvl = 'project' THEN
      UPDATE public.workspace_projects p
      SET weight = w, updated_at = now()
      WHERE p.id = wid
        AND p.subsidiary_id = sid
        AND public.workspace_project_active(p.id);
    ELSIF lvl = 'task' THEN
      UPDATE public.workspace_tasks t
      SET weight = w
      WHERE t.id = wid
        AND public.workspace_project_active(t.project_id);
    ELSE
      CONTINUE;
    END IF;
    IF FOUND THEN
      applied := applied + 1;
    END IF;
  END LOOP;
  RETURN applied;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_unlink_task_project(_task_id uuid, _project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  home uuid;
BEGIN
  SELECT project_id INTO home FROM public.workspace_tasks WHERE id = _task_id;
  IF home IS NULL THEN
    RAISE EXCEPTION 'That task was not found.';
  END IF;
  IF home = _project_id THEN
    RAISE EXCEPTION 'A task stays on the project it was created in.';
  END IF;
  IF NOT public.workspace_project_active(home) AND NOT public.workspace_project_active(_project_id) THEN
    RAISE EXCEPTION 'You need to be on the project.';
  END IF;
  DELETE FROM public.workspace_task_projects
  WHERE task_id = _task_id AND project_id = _project_id;
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
  level text := lower(btrim(COALESCE(_level, '')));
  priority text := lower(btrim(COALESCE(_priority, 'medium')));
  status text := lower(btrim(COALESCE(_status, 'not_started')));
  saved uuid;
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF NOT public.workspace_can_manage_objectives() THEN
    RAISE EXCEPTION 'Company and unit objectives are set by leadership and managers.';
  END IF;
  IF level = 'company' AND NOT public.workspace_is_leadership() THEN
    RAISE EXCEPTION 'Company objectives are set by company leadership.';
  END IF;
  IF level NOT IN ('company', 'unit') THEN
    RAISE EXCEPTION 'Choose a company or unit objective.';
  END IF;
  IF priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Choose a priority.';
  END IF;
  IF status NOT IN ('not_started', 'in_progress', 'done', 'blocked') THEN
    RAISE EXCEPTION 'Choose a status.';
  END IF;
  IF level = 'unit' AND NOT EXISTS (
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
      sid, level, CASE WHEN level = 'company' THEN NULL ELSE _parent_id END,
      btrim(_title), priority, status, _due_date, v_period, me
    ) RETURNING id INTO saved;
  ELSE
    UPDATE public.workspace_objectives
    SET title = btrim(_title),
        priority = priority,
        status = status,
        due_date = _due_date,
        parent_id = CASE WHEN level = 'company' THEN NULL ELSE _parent_id END,
        updated_at = now()
    WHERE id = _id AND subsidiary_id = sid AND level = level
    RETURNING id INTO saved;
    IF saved IS NULL THEN
      RAISE EXCEPTION 'That objective is not in this company.';
    END IF;
  END IF;
  RETURN saved;
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

  PERFORM public.workspace_assert_leave_ok(_employee_id, sid, _start_date, _end_date, _request_id, true);
  mgr := public.workspace_line_manager_id(_employee_id);

  IF _request_id IS NULL THEN
    INSERT INTO public.workspace_leave_requests (
      subsidiary_id, employee_id, leave_type, start_date, end_date, note,
      status, manager_id, decided_by, decided_at
    ) VALUES (
      sid, _employee_id, _leave_type, _start_date, _end_date, reason,
      'approved', mgr, me, now()
    ) RETURNING id INTO rid;
    RETURN rid;
  END IF;

  UPDATE public.workspace_leave_requests
  SET leave_type = _leave_type,
      start_date = _start_date,
      end_date = _end_date,
      note = reason,
      status = 'approved',
      manager_id = COALESCE(manager_id, mgr),
      decided_by = me,
      decided_at = now(),
      updated_at = now()
  WHERE id = _request_id
    AND employee_id = _employee_id
    AND subsidiary_id = sid
    AND status IN ('pending', 'manager_approved', 'approved')
  RETURNING id INTO rid;

  IF rid IS NULL THEN
    RAISE EXCEPTION 'That leave request cannot be moved.';
  END IF;
  RETURN rid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_period_start(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_item_weight(int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_objectives_are_locked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_planner_lock_on() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_set_project_plan(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_apply_weights(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_unlink_task_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_place_leave(uuid, text, date, date, text, uuid) TO authenticated;

UPDATE public.workspace_projects p
SET status = CASE
  WHEN COALESCE((public.workspace_project_analysis(p.id)->>'progress_pct')::int, 0) >= 100 THEN 'done'
  WHEN COALESCE((public.workspace_project_analysis(p.id)->>'progress_pct')::int, 0) > 0 THEN 'in_progress'
  ELSE p.status
END
WHERE p.status = 'not_started';
