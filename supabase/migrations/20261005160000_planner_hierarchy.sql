-- Planner hierarchy for Executive Office and VigiPay.
-- Company objectives and unit objectives are optional at the unit layer.
-- A personal key result hangs off a unit objective, or directly off a company objective.
-- A project feeds one key result. Task completion rolls upward.
-- Each child counts equally until a weighting method is specified.

ALTER TABLE public.workspace_projects
  ADD COLUMN IF NOT EXISTS key_result_id uuid,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';

ALTER TABLE public.workspace_projects
  DROP CONSTRAINT IF EXISTS workspace_projects_priority_check;
ALTER TABLE public.workspace_projects
  ADD CONSTRAINT workspace_projects_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));

CREATE TABLE IF NOT EXISTS public.workspace_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('company', 'unit')),
  parent_id uuid REFERENCES public.workspace_objectives(id) ON DELETE RESTRICT,
  title text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done', 'blocked')),
  due_date date,
  period text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_objectives_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  CONSTRAINT workspace_objectives_parent_shape CHECK (
    (level = 'company' AND parent_id IS NULL)
    OR (level = 'unit' AND parent_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.workspace_key_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.employees(id),
  company_objective_id uuid REFERENCES public.workspace_objectives(id) ON DELETE RESTRICT,
  unit_objective_id uuid REFERENCES public.workspace_objectives(id) ON DELETE RESTRICT,
  title text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done', 'blocked')),
  due_date date,
  period text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_key_results_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  CONSTRAINT workspace_key_results_one_parent CHECK (
    unit_objective_id IS NOT NULL OR company_objective_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.workspace_task_projects (
  task_id uuid NOT NULL REFERENCES public.workspace_tasks(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, project_id)
);

ALTER TABLE public.workspace_projects
  DROP CONSTRAINT IF EXISTS workspace_projects_key_result_fk;
ALTER TABLE public.workspace_projects
  ADD CONSTRAINT workspace_projects_key_result_fk
  FOREIGN KEY (key_result_id) REFERENCES public.workspace_key_results(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workspace_objectives_subsidiary_idx
  ON public.workspace_objectives (subsidiary_id, level, period);
CREATE INDEX IF NOT EXISTS workspace_key_results_owner_idx
  ON public.workspace_key_results (owner_id, period);
CREATE INDEX IF NOT EXISTS workspace_projects_key_result_idx
  ON public.workspace_projects (key_result_id);
CREATE INDEX IF NOT EXISTS workspace_task_projects_project_idx
  ON public.workspace_task_projects (project_id);

ALTER TABLE public.workspace_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_task_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_objectives_select ON public.workspace_objectives;
CREATE POLICY workspace_objectives_select ON public.workspace_objectives
  FOR SELECT TO authenticated
  USING (subsidiary_id = public.workspace_my_subsidiary_id());

DROP POLICY IF EXISTS workspace_key_results_select ON public.workspace_key_results;
CREATE POLICY workspace_key_results_select ON public.workspace_key_results
  FOR SELECT TO authenticated
  USING (
    subsidiary_id = public.workspace_my_subsidiary_id()
    AND (
      owner_id = public.current_employee_id()
      OR public.workspace_is_leadership()
      OR public.current_employee_id() IN (
        SELECT e.manager_id FROM public.employees e WHERE e.id = owner_id
        UNION
        SELECT e.ghc_manager_id FROM public.employees e WHERE e.id = owner_id
      )
    )
  );

DROP POLICY IF EXISTS workspace_task_projects_select ON public.workspace_task_projects;
CREATE POLICY workspace_task_projects_select ON public.workspace_task_projects
  FOR SELECT TO authenticated
  USING (public.workspace_project_visible(project_id));

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

CREATE OR REPLACE FUNCTION public.workspace_current_period()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char((now() AT TIME ZONE 'Africa/Lagos')::date, 'YYYY')
    || '-Q'
    || EXTRACT(QUARTER FROM (now() AT TIME ZONE 'Africa/Lagos'))::text;
$$;

CREATE OR REPLACE FUNCTION public.workspace_can_manage_objectives()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.workspace_is_leadership()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = public.current_employee_id()
        AND COALESCE(e.hierarchy_level, 99) <= 1
    );
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
        'progress_pct', COALESCE((
          SELECT ROUND(AVG(child.pct))::int
          FROM (
            SELECT public.workspace_unit_progress(u.id) AS pct
            FROM public.workspace_objectives u
            WHERE u.parent_id = o.id
            UNION ALL
            SELECT public.workspace_key_result_progress(k.id) AS pct
            FROM public.workspace_key_results k
            WHERE k.company_objective_id = o.id AND k.unit_objective_id IS NULL
          ) child
        ), 0),
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

CREATE OR REPLACE FUNCTION public.workspace_key_result_progress(_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE((
    SELECT ROUND(AVG((public.workspace_project_analysis(p.id)->>'progress_pct')::numeric))::int
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
    SELECT ROUND(AVG(public.workspace_key_result_progress(k.id)))::int
    FROM public.workspace_key_results k
    WHERE k.unit_objective_id = _id
  ), 0);
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
  locked boolean;
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

  SELECT EXISTS (
    SELECT 1 FROM public.workspace_objectives o
    WHERE o.subsidiary_id = sid AND o.period = v_period AND o.locked
  ) INTO locked;
  IF locked AND NOT public.workspace_is_leadership() THEN
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
    WHERE id = _id AND subsidiary_id = sid
    RETURNING id INTO saved;
    IF saved IS NULL THEN
      RAISE EXCEPTION 'That objective is not in this company.';
    END IF;
  END IF;
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_delete_objective(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  sid uuid := public.workspace_my_subsidiary_id();
BEGIN
  IF NOT public.workspace_is_leadership() THEN
    RAISE EXCEPTION 'Only company leadership can remove an objective.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_objectives c WHERE c.parent_id = _id
    UNION ALL
    SELECT 1 FROM public.workspace_key_results k
    WHERE k.company_objective_id = _id OR k.unit_objective_id = _id
  ) THEN
    RAISE EXCEPTION 'Remove the items under this objective first.';
  END IF;
  DELETE FROM public.workspace_objectives WHERE id = _id AND subsidiary_id = sid;
END;
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
BEGIN
  IF NOT public.workspace_is_leadership() THEN
    RAISE EXCEPTION 'Only company leadership can lock the quarter.';
  END IF;
  UPDATE public.workspace_objectives
  SET locked = COALESCE(_locked, false), updated_at = now()
  WHERE subsidiary_id = sid AND period = v_period;
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
  priority text := lower(btrim(COALESCE(_priority, 'medium')));
  status text := lower(btrim(COALESCE(_status, 'not_started')));
  company_id uuid := _company_objective_id;
  saved uuid;
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  IF priority NOT IN ('low', 'medium', 'high', 'critical') OR status NOT IN ('not_started', 'in_progress', 'done', 'blocked') THEN
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
      btrim(_title), priority, status, _due_date, v_period, me
    ) RETURNING id INTO saved;
  ELSE
    UPDATE public.workspace_key_results
    SET title = btrim(_title),
        owner_id = owner,
        company_objective_id = company_id,
        unit_objective_id = _unit_objective_id,
        priority = priority,
        status = status,
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

CREATE OR REPLACE FUNCTION public.workspace_delete_key_result(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspace_projects p WHERE p.key_result_id = _id) THEN
    RAISE EXCEPTION 'Unlink the projects on this key result first.';
  END IF;
  DELETE FROM public.workspace_key_results k
  WHERE k.id = _id AND k.subsidiary_id = sid
    AND (
      k.owner_id = me
      OR public.workspace_is_leadership()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = k.owner_id AND me IN (e.manager_id, e.ghc_manager_id)
      )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_set_project_key_result(_project_id uuid, _key_result_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  sid uuid := public.workspace_my_subsidiary_id();
BEGIN
  IF NOT public.workspace_project_active(_project_id) THEN
    RAISE EXCEPTION 'You are not on this project.';
  END IF;
  IF _key_result_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_key_results k
    WHERE k.id = _key_result_id AND k.subsidiary_id = sid
  ) THEN
    RAISE EXCEPTION 'Choose a key result in this company.';
  END IF;
  UPDATE public.workspace_projects
  SET key_result_id = _key_result_id, updated_at = now()
  WHERE id = _project_id AND subsidiary_id = sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_link_task_project(_task_id uuid, _project_id uuid)
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
  IF NOT public.workspace_project_active(home) OR NOT public.workspace_project_active(_project_id) THEN
    RAISE EXCEPTION 'You need to be on both projects.';
  END IF;
  IF home = _project_id THEN
    RETURN;
  END IF;
  INSERT INTO public.workspace_task_projects (task_id, project_id)
  VALUES (_task_id, _project_id)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_current_period() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_can_manage_objectives() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_get_planner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_key_result_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_unit_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_save_objective(uuid, text, uuid, text, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_delete_objective(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_lock_objectives(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_save_key_result(uuid, text, uuid, uuid, text, text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_delete_key_result(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_set_project_key_result(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_link_task_project(uuid, uuid) TO authenticated;
