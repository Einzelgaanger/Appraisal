-- Internal workspace: company-private projects, tasks, delegation, activity log.
-- Shared UI across tenants; every row is scoped to the caller's active subsidiary.

CREATE TABLE IF NOT EXISTS public.workspace_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  due_date date,
  created_by uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_projects_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 160)
);

CREATE TABLE IF NOT EXISTS public.workspace_project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'declined')),
  invited_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (project_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.workspace_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  created_by uuid NOT NULL REFERENCES public.employees(id),
  assignee_id uuid NOT NULL REFERENCES public.employees(id),
  due_date date,
  progress int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_tasks_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 200)
);

CREATE TABLE IF NOT EXISTS public.workspace_task_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.workspace_tasks(id) ON DELETE CASCADE,
  from_employee_id uuid NOT NULL REFERENCES public.employees(id),
  to_employee_id uuid NOT NULL REFERENCES public.employees(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.workspace_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.workspace_tasks(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES public.employees(id),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_projects_subsidiary_idx ON public.workspace_projects (subsidiary_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_members_employee_idx ON public.workspace_project_members (employee_id, status);
CREATE INDEX IF NOT EXISTS workspace_members_project_idx ON public.workspace_project_members (project_id);
CREATE INDEX IF NOT EXISTS workspace_tasks_project_idx ON public.workspace_tasks (project_id, created_at);
CREATE INDEX IF NOT EXISTS workspace_delegations_to_idx ON public.workspace_task_delegations (to_employee_id, status);
CREATE INDEX IF NOT EXISTS workspace_logs_project_idx ON public.workspace_activity_logs (project_id, created_at DESC);

ALTER TABLE public.workspace_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_task_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.workspace_my_subsidiary_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT e.subsidiary_id
  FROM public.employees e
  WHERE e.id = public.current_employee_id()
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
    JOIN public.workspace_project_members m ON m.project_id = p.id
    WHERE p.id = _project_id
      AND p.subsidiary_id = public.workspace_my_subsidiary_id()
      AND m.employee_id = public.current_employee_id()
      AND m.status IN ('invited', 'active')
  )
$$;

CREATE OR REPLACE FUNCTION public.workspace_project_active(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_project_members m
    JOIN public.workspace_projects p ON p.id = m.project_id
    WHERE m.project_id = _project_id
      AND m.employee_id = public.current_employee_id()
      AND m.status = 'active'
      AND p.subsidiary_id = public.workspace_my_subsidiary_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.workspace_log(
  _project_id uuid,
  _action text,
  _detail jsonb DEFAULT '{}'::jsonb,
  _task_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  sid uuid;
BEGIN
  SELECT subsidiary_id INTO sid FROM public.workspace_projects WHERE id = _project_id;
  IF sid IS NULL THEN RETURN; END IF;
  INSERT INTO public.workspace_activity_logs (subsidiary_id, project_id, task_id, actor_id, action, detail)
  VALUES (sid, _project_id, _task_id, public.current_employee_id(), _action, COALESCE(_detail, '{}'::jsonb));
END;
$$;

DROP POLICY IF EXISTS workspace_projects_select ON public.workspace_projects;
CREATE POLICY workspace_projects_select ON public.workspace_projects
  FOR SELECT TO authenticated
  USING (public.workspace_project_visible(id));

DROP POLICY IF EXISTS workspace_members_select ON public.workspace_project_members;
CREATE POLICY workspace_members_select ON public.workspace_project_members
  FOR SELECT TO authenticated
  USING (public.workspace_project_visible(project_id));

DROP POLICY IF EXISTS workspace_tasks_select ON public.workspace_tasks;
CREATE POLICY workspace_tasks_select ON public.workspace_tasks
  FOR SELECT TO authenticated
  USING (public.workspace_project_active(project_id));

DROP POLICY IF EXISTS workspace_delegations_select ON public.workspace_task_delegations;
CREATE POLICY workspace_delegations_select ON public.workspace_task_delegations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_tasks t
      WHERE t.id = task_id AND public.workspace_project_active(t.project_id)
    )
    OR to_employee_id = public.current_employee_id()
    OR from_employee_id = public.current_employee_id()
  );

DROP POLICY IF EXISTS workspace_logs_select ON public.workspace_activity_logs;
CREATE POLICY workspace_logs_select ON public.workspace_activity_logs
  FOR SELECT TO authenticated
  USING (public.workspace_project_active(project_id));

CREATE OR REPLACE FUNCTION public.workspace_create_project(
  _name text,
  _description text DEFAULT NULL,
  _due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
  pid uuid;
BEGIN
  IF me IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'Your company profile is not ready.';
  END IF;
  INSERT INTO public.workspace_projects (subsidiary_id, name, description, due_date, created_by)
  VALUES (sid, btrim(_name), NULLIF(btrim(COALESCE(_description, '')), ''), _due_date, me)
  RETURNING id INTO pid;

  INSERT INTO public.workspace_project_members (project_id, employee_id, role, status, invited_by, responded_at)
  VALUES (pid, me, 'owner', 'active', me, now());

  PERFORM public.workspace_log(pid, 'project.created', jsonb_build_object('name', btrim(_name)));
  RETURN pid;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_invite_member(_project_id uuid, _employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  sid uuid := public.workspace_my_subsidiary_id();
  invited_name text;
BEGIN
  IF NOT public.workspace_project_active(_project_id) THEN
    RAISE EXCEPTION 'You are not on this project.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id AND e.subsidiary_id = sid
  ) THEN
    RAISE EXCEPTION 'That person is not in your company.';
  END IF;
  IF _employee_id = me THEN
    RAISE EXCEPTION 'You are already on this project.';
  END IF;

  INSERT INTO public.workspace_project_members (project_id, employee_id, role, status, invited_by)
  VALUES (_project_id, _employee_id, 'member', 'invited', me)
  ON CONFLICT (project_id, employee_id) DO UPDATE
    SET status = 'invited',
        invited_by = EXCLUDED.invited_by,
        responded_at = NULL
    WHERE workspace_project_members.status = 'declined';

  SELECT name INTO invited_name FROM public.employees WHERE id = _employee_id;
  PERFORM public.workspace_log(_project_id, 'member.invited', jsonb_build_object('employee_id', _employee_id, 'name', invited_name));
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_respond_invite(_project_id uuid, _accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
BEGIN
  UPDATE public.workspace_project_members
  SET status = CASE WHEN _accept THEN 'active' ELSE 'declined' END,
      responded_at = now()
  WHERE project_id = _project_id
    AND employee_id = me
    AND status = 'invited';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invite for this project.';
  END IF;

  PERFORM public.workspace_log(
    _project_id,
    CASE WHEN _accept THEN 'member.joined' ELSE 'member.declined' END,
    jsonb_build_object('employee_id', me)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_create_task(
  _project_id uuid,
  _title text,
  _notes text DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL,
  _due_date date DEFAULT NULL
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
BEGIN
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

  INSERT INTO public.workspace_tasks (project_id, title, notes, created_by, assignee_id, due_date)
  VALUES (_project_id, btrim(_title), NULLIF(btrim(COALESCE(_notes, '')), ''), me, assignee, _due_date)
  RETURNING id INTO tid;

  SELECT name INTO assignee_name FROM public.employees WHERE id = assignee;
  PERFORM public.workspace_log(
    _project_id,
    'task.created',
    jsonb_build_object('title', btrim(_title), 'assignee_id', assignee, 'assignee', assignee_name),
    tid
  );
  RETURN tid;
END;
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

  UPDATE public.workspace_tasks
  SET progress = _progress,
      status = new_status,
      updated_at = now()
  WHERE id = _task_id;

  PERFORM public.workspace_log(
    t.project_id,
    'task.progress',
    jsonb_build_object('title', t.title, 'progress', _progress, 'status', new_status),
    _task_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_delegate_task(_task_id uuid, _to_employee_id uuid, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  t public.workspace_tasks%ROWTYPE;
  did uuid;
  to_name text;
BEGIN
  SELECT * INTO t FROM public.workspace_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.'; END IF;
  IF t.assignee_id <> me THEN
    RAISE EXCEPTION 'Only the current assignee can delegate this task.';
  END IF;
  IF _to_employee_id = me THEN
    RAISE EXCEPTION 'You already own this task.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_project_members m
    WHERE m.project_id = t.project_id AND m.employee_id = _to_employee_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'You can only delegate to an active project member.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_task_delegations d
    WHERE d.task_id = _task_id AND d.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This task already has a pending delegation.';
  END IF;

  INSERT INTO public.workspace_task_delegations (task_id, from_employee_id, to_employee_id, note)
  VALUES (_task_id, me, _to_employee_id, NULLIF(btrim(COALESCE(_note, '')), ''))
  RETURNING id INTO did;

  SELECT name INTO to_name FROM public.employees WHERE id = _to_employee_id;
  PERFORM public.workspace_log(
    t.project_id,
    'task.delegated',
    jsonb_build_object('title', t.title, 'to_employee_id', _to_employee_id, 'to', to_name),
    _task_id
  );
  RETURN did;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_respond_delegation(_delegation_id uuid, _accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := public.current_employee_id();
  d public.workspace_task_delegations%ROWTYPE;
  t public.workspace_tasks%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.workspace_task_delegations WHERE id = _delegation_id;
  IF NOT FOUND OR d.to_employee_id <> me OR d.status <> 'pending' THEN
    RAISE EXCEPTION 'No pending delegation for you.';
  END IF;
  SELECT * INTO t FROM public.workspace_tasks WHERE id = d.task_id;

  UPDATE public.workspace_task_delegations
  SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
      resolved_at = now()
  WHERE id = _delegation_id;

  IF _accept THEN
    UPDATE public.workspace_tasks
    SET assignee_id = me, updated_at = now()
    WHERE id = t.id;
  END IF;

  PERFORM public.workspace_log(
    t.project_id,
    CASE WHEN _accept THEN 'task.accepted' ELSE 'task.declined' END,
    jsonb_build_object('title', t.title),
    t.id
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
        m.role AS my_role,
        m.status AS my_status,
        owner.employee_id AS owner_id,
        oe.name AS owner_name,
        COALESCE((SELECT ROUND(AVG(t.progress))::int FROM public.workspace_tasks t WHERE t.project_id = p.id), 0) AS progress_pct,
        (SELECT COUNT(*)::int FROM public.workspace_tasks t WHERE t.project_id = p.id) AS task_count,
        (SELECT COUNT(*)::int FROM public.workspace_tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
        (SELECT COUNT(*)::int FROM public.workspace_project_members mm WHERE mm.project_id = p.id AND mm.status = 'active') AS member_count,
        GREATEST(p.created_at, COALESCE(m.created_at, p.created_at)) AS sort_ts
      FROM public.workspace_projects p
      JOIN public.workspace_project_members m
        ON m.project_id = p.id AND m.employee_id = me AND m.status IN ('invited', 'active')
      LEFT JOIN public.workspace_project_members owner
        ON owner.project_id = p.id AND owner.role = 'owner' AND owner.status = 'active'
      LEFT JOIN public.employees oe ON oe.id = owner.employee_id
      WHERE p.subsidiary_id = public.workspace_my_subsidiary_id()
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
  visible boolean;
  active boolean;
BEGIN
  visible := public.workspace_project_visible(_project_id);
  IF NOT visible THEN
    RAISE EXCEPTION 'Project not found.';
  END IF;
  active := public.workspace_project_active(_project_id);

  RETURN jsonb_build_object(
    'project', (
      SELECT jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'due_date', p.due_date,
        'created_at', p.created_at,
        'created_by', p.created_by,
        'progress_pct', COALESCE((SELECT ROUND(AVG(t.progress))::int FROM public.workspace_tasks t WHERE t.project_id = p.id), 0),
        'task_count', (SELECT COUNT(*)::int FROM public.workspace_tasks t WHERE t.project_id = p.id)
      )
      FROM public.workspace_projects p
      WHERE p.id = _project_id
    ),
    'my_membership', (
      SELECT jsonb_build_object('role', m.role, 'status', m.status)
      FROM public.workspace_project_members m
      WHERE m.project_id = _project_id AND m.employee_id = me
    ),
    'members', CASE WHEN active THEN COALESCE((
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
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'tasks', CASE WHEN active THEN COALESCE((
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
      ) ORDER BY t.status, t.due_date NULLS LAST, t.created_at)
      FROM public.workspace_tasks t
      JOIN public.employees ae ON ae.id = t.assignee_id
      WHERE t.project_id = _project_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'activity', CASE WHEN active THEN COALESCE((
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
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_company_directory()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'role', e.role,
    'email', e.email
  ) ORDER BY e.name), '[]'::jsonb)
  FROM public.employees e
  WHERE e.subsidiary_id = public.workspace_my_subsidiary_id()
    AND e.id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_my_subsidiary_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_project_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_project_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_create_project(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_invite_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_respond_invite(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_create_task(uuid, text, text, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_set_task_progress(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_delegate_task(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_respond_delegation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_list_projects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_get_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_company_directory() TO authenticated;

GRANT SELECT ON public.workspace_projects TO authenticated;
GRANT SELECT ON public.workspace_project_members TO authenticated;
GRANT SELECT ON public.workspace_tasks TO authenticated;
GRANT SELECT ON public.workspace_task_delegations TO authenticated;
GRANT SELECT ON public.workspace_activity_logs TO authenticated;
