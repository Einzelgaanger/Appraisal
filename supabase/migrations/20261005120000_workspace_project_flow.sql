-- Projects only: waiting state, cruciality, and a read of the work for
-- members, their line manager, and company leadership (including Bunmi).
-- Tasks are still typed in by hand. Appraisal and leave are untouched.

ALTER TABLE public.workspace_tasks
  ADD COLUMN IF NOT EXISTS flow_state text,
  ADD COLUMN IF NOT EXISTS cruciality text,
  ADD COLUMN IF NOT EXISTS flow_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_on text,
  ADD COLUMN IF NOT EXISTS last_movement text,
  ADD COLUMN IF NOT EXISTS blocked_on_task_id uuid;

UPDATE public.workspace_tasks
SET
  flow_state = CASE status
    WHEN 'done' THEN 'done'
    WHEN 'in_progress' THEN 'active'
    ELSE 'ready'
  END,
  cruciality = COALESCE(cruciality, 'medium'),
  flow_changed_at = COALESCE(flow_changed_at, updated_at, created_at, now())
WHERE flow_state IS NULL OR cruciality IS NULL OR flow_changed_at IS NULL;

ALTER TABLE public.workspace_tasks
  ALTER COLUMN flow_state SET DEFAULT 'ready',
  ALTER COLUMN flow_state SET NOT NULL,
  ALTER COLUMN cruciality SET DEFAULT 'medium',
  ALTER COLUMN cruciality SET NOT NULL,
  ALTER COLUMN flow_changed_at SET DEFAULT now(),
  ALTER COLUMN flow_changed_at SET NOT NULL;

ALTER TABLE public.workspace_tasks
  DROP CONSTRAINT IF EXISTS workspace_tasks_flow_state_check;
ALTER TABLE public.workspace_tasks
  ADD CONSTRAINT workspace_tasks_flow_state_check
  CHECK (flow_state IN (
    'ready', 'active',
    'waiting_internal', 'waiting_external', 'waiting_decision', 'waiting_dependency',
    'review', 'done', 'cancelled'
  ));

ALTER TABLE public.workspace_tasks
  DROP CONSTRAINT IF EXISTS workspace_tasks_cruciality_check;
ALTER TABLE public.workspace_tasks
  ADD CONSTRAINT workspace_tasks_cruciality_check
  CHECK (cruciality IN ('low', 'medium', 'high', 'critical'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_tasks_blocked_on_task_id_fkey'
  ) THEN
    ALTER TABLE public.workspace_tasks
      ADD CONSTRAINT workspace_tasks_blocked_on_task_id_fkey
      FOREIGN KEY (blocked_on_task_id) REFERENCES public.workspace_tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Weekdays in Lagos. A weekend does not add age to a waiting task.
CREATE OR REPLACE FUNCTION public.workspace_working_days(_from timestamptz, _to timestamptz DEFAULT now())
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN _from IS NULL OR _to IS NULL OR _to <= _from THEN 0
    ELSE (
      SELECT count(*)::int
      FROM generate_series(
        (_from AT TIME ZONE 'Africa/Lagos')::date,
        ((_to AT TIME ZONE 'Africa/Lagos')::date - 1),
        interval '1 day'
      ) AS d
      WHERE EXTRACT(ISODOW FROM d) < 6
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_is_leadership()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = public.current_employee_id()
      AND (
        COALESCE(e.company_admin, false)
        OR COALESCE(e.hierarchy_level, 99) = 0
        OR e.name ILIKE 'Bunmi Akinyemiju%'
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_is_line_manager(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_project_members m
    JOIN public.employees e ON e.id = m.employee_id
    WHERE m.project_id = _project_id
      AND m.status = 'active'
      AND public.current_employee_id() IN (e.manager_id, e.ghc_manager_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_project_visible(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_projects p
    WHERE p.id = _project_id
      AND p.subsidiary_id = public.workspace_my_subsidiary_id()
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_project_members m
          WHERE m.project_id = p.id
            AND m.employee_id = public.current_employee_id()
            AND m.status IN ('invited', 'active')
        )
        OR public.workspace_is_leadership()
        OR public.workspace_is_line_manager(p.id)
      )
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
  ),
  counted AS (
    SELECT
      count(*) FILTER (WHERE flow_state <> 'cancelled')::int AS task_count,
      count(*) FILTER (WHERE flow_state = 'done')::int AS done_count,
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
      WHEN counted.task_count = 0 THEN 0
      ELSE ROUND(100.0 * counted.done_count / counted.task_count)::int
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

CREATE OR REPLACE FUNCTION public.workspace_set_task_progress(_task_id uuid, _progress int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  t public.workspace_tasks%ROWTYPE;
  new_status text;
  new_flow text;
BEGIN
  SELECT * INTO t FROM public.workspace_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.'; END IF;
  IF NOT public.workspace_project_active(t.project_id) THEN
    RAISE EXCEPTION 'You are not on this project.';
  END IF;
  IF t.assignee_id <> me AND t.created_by <> me THEN
    RAISE EXCEPTION 'Only the assignee or the person who created the task can update progress.';
  END IF;
  IF _progress < 0 OR _progress > 100 THEN
    RAISE EXCEPTION 'Progress must be between 0 and 100.';
  END IF;

  new_status := CASE
    WHEN _progress >= 100 THEN 'done'
    WHEN _progress > 0 THEN 'in_progress'
    ELSE 'todo'
  END;
  new_flow := CASE
    WHEN _progress >= 100 THEN 'done'
    WHEN t.flow_state = 'done' AND _progress < 100 THEN 'active'
    WHEN t.flow_state = 'cancelled' THEN 'cancelled'
    WHEN t.flow_state = 'ready' AND _progress > 0 THEN 'active'
    ELSE t.flow_state
  END;

  UPDATE public.workspace_tasks
  SET progress = _progress,
      status = new_status,
      flow_state = new_flow,
      flow_changed_at = CASE WHEN new_flow IS DISTINCT FROM t.flow_state THEN now() ELSE flow_changed_at END,
      updated_at = now()
  WHERE id = _task_id;

  PERFORM public.workspace_log(
    t.project_id,
    'task.progress',
    jsonb_build_object('title', t.title, 'progress', _progress, 'status', new_status, 'flow_state', new_flow),
    _task_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_update_task(
  _task_id uuid,
  _flow_state text,
  _cruciality text,
  _waiting_on text DEFAULT NULL,
  _last_movement text DEFAULT NULL,
  _blocked_on_task_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  t public.workspace_tasks%ROWTYPE;
  flow text := lower(btrim(COALESCE(_flow_state, '')));
  band text := lower(btrim(COALESCE(_cruciality, '')));
  new_status text;
  new_progress int;
BEGIN
  IF flow NOT IN (
    'ready', 'active',
    'waiting_internal', 'waiting_external', 'waiting_decision', 'waiting_dependency',
    'review', 'done', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Choose a valid state for this task.';
  END IF;
  IF band NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Choose how crucial this task is.';
  END IF;

  SELECT * INTO t FROM public.workspace_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.'; END IF;
  IF NOT public.workspace_project_active(t.project_id) THEN
    RAISE EXCEPTION 'You are not on this project.';
  END IF;
  IF t.assignee_id <> me AND t.created_by <> me THEN
    RAISE EXCEPTION 'Only the assignee or the person who created the task can update it.';
  END IF;
  IF _blocked_on_task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_tasks other
    WHERE other.id = _blocked_on_task_id
      AND other.project_id = t.project_id
      AND other.id <> t.id
  ) THEN
    RAISE EXCEPTION 'That dependency is not a task on this project.';
  END IF;

  new_status := CASE
    WHEN flow = 'done' THEN 'done'
    WHEN flow = 'ready' THEN 'todo'
    WHEN flow = 'cancelled' THEN t.status
    ELSE 'in_progress'
  END;
  new_progress := CASE
    WHEN flow = 'done' THEN 100
    WHEN t.progress = 100 AND flow <> 'done' THEN 90
    ELSE t.progress
  END;

  UPDATE public.workspace_tasks
  SET flow_state = flow,
      cruciality = band,
      waiting_on = NULLIF(btrim(COALESCE(_waiting_on, '')), ''),
      last_movement = NULLIF(btrim(COALESCE(_last_movement, '')), ''),
      blocked_on_task_id = _blocked_on_task_id,
      status = new_status,
      progress = new_progress,
      flow_changed_at = CASE WHEN flow IS DISTINCT FROM t.flow_state THEN now() ELSE flow_changed_at END,
      updated_at = now()
  WHERE id = _task_id;

  PERFORM public.workspace_log(
    t.project_id,
    'task.updated',
    jsonb_build_object(
      'title', t.title,
      'flow_state', flow,
      'cruciality', band,
      'waiting_on', NULLIF(btrim(COALESCE(_waiting_on, '')), '')
    ),
    _task_id
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
        'waiting_on', t.waiting_on,
        'last_movement', t.last_movement,
        'blocked_on_task_id', t.blocked_on_task_id,
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

GRANT EXECUTE ON FUNCTION public.workspace_working_days(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_is_leadership() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_is_line_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_project_analysis(uuid) TO authenticated;
DROP FUNCTION IF EXISTS public.workspace_create_task(uuid, text, text, uuid, date);

CREATE OR REPLACE FUNCTION public.workspace_create_task(
  _project_id uuid,
  _title text,
  _notes text DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL,
  _due_date date DEFAULT NULL,
  _cruciality text DEFAULT 'medium'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  assignee uuid;
  tid uuid;
  assignee_name text;
  band text := lower(btrim(COALESCE(_cruciality, 'medium')));
BEGIN
  IF band NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Choose how crucial this task is.';
  END IF;
  IF NOT public.workspace_project_active(_project_id) THEN
    RAISE EXCEPTION 'You are not on this project.';
  END IF;
  assignee := COALESCE(_assignee_id, me);
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_project_members m
    WHERE m.project_id = _project_id AND m.employee_id = assignee AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Assignee must be an active member of the project.';
  END IF;

  INSERT INTO public.workspace_tasks (
    project_id, title, notes, created_by, assignee_id, due_date, cruciality, flow_state
  )
  VALUES (
    _project_id, btrim(_title), NULLIF(btrim(COALESCE(_notes, '')), ''), me, assignee, _due_date, band, 'ready'
  )
  RETURNING id INTO tid;

  SELECT name INTO assignee_name FROM public.employees WHERE id = assignee;
  PERFORM public.workspace_log(
    _project_id,
    'task.created',
    jsonb_build_object('title', btrim(_title), 'assignee_id', assignee, 'assignee', assignee_name, 'cruciality', band),
    tid
  );
  RETURN tid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_create_task(uuid, text, text, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_update_task(uuid, text, text, text, text, uuid) TO authenticated;
