import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type ProjectMembershipStatus = 'invited' | 'active' | 'declined';
export type ProjectRole = 'owner' | 'member';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskFlowState =
  | 'ready'
  | 'active'
  | 'waiting_internal'
  | 'waiting_external'
  | 'waiting_decision'
  | 'waiting_dependency'
  | 'review'
  | 'done'
  | 'cancelled';
export type TaskCruciality = 'low' | 'medium' | 'high' | 'critical';
export type ProjectViewReason = 'member' | 'line_manager' | 'leadership';

export const FLOW_LABELS: Record<TaskFlowState, string> = {
  ready: 'Ready',
  active: 'Moving',
  waiting_internal: 'Waiting on someone here',
  waiting_external: 'Waiting outside',
  waiting_decision: 'Waiting on a decision',
  waiting_dependency: 'Waiting on another task',
  review: 'In review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const CRUCIAL_LABELS: Record<TaskCruciality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export type WorkspaceProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  created_at: string;
  created_by: string;
  my_role: ProjectRole | 'viewer';
  my_status: ProjectMembershipStatus;
  owner_id: string | null;
  owner_name: string | null;
  priority: PlannerPriority;
  status: PlannerStatus;
  weight: number;
  key_result_id: string | null;
  key_result_title: string | null;
  progress_pct: number;
  task_count: number;
  done_count: number;
  member_count: number;
  remaining_count: number;
  waiting_count: number;
  crucial_count: number;
  oldest_wait_days: number;
  view_reason: ProjectViewReason;
  can_edit: boolean;
  crucial_remaining: CrucialTask[];
};

export type CrucialTask = {
  id: string;
  title: string;
  flow_state: TaskFlowState;
  cruciality: TaskCruciality;
  assignee_name: string;
  waiting_on: string | null;
  wait_days: number;
};

export type WorkspaceMember = {
  employee_id: string;
  name: string;
  role: ProjectRole;
  status: ProjectMembershipStatus;
  email: string | null;
};

export type WorkspaceTask = {
  id: string;
  title: string;
  notes: string | null;
  created_by: string;
  assignee_id: string;
  assignee_name: string;
  due_date: string | null;
  progress: number;
  status: TaskStatus;
  flow_state: TaskFlowState;
  cruciality: TaskCruciality;
  waiting_on: string | null;
  last_movement: string | null;
  blocked_on_task_id: string | null;
  shared?: boolean;
  weight?: number;
  wait_days: number;
  pending_delegation: {
    id: string;
    to_employee_id: string;
    to_name: string;
    from_employee_id: string;
  } | null;
};

export type WorkspaceActivity = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
  actor_id: string;
  actor_name: string;
};

export type WorkspaceProjectDetail = {
  project: {
    id: string;
    name: string;
    description: string | null;
    due_date: string | null;
    priority: PlannerPriority;
    status: PlannerStatus;
    weight: number;
    created_at: string;
    created_by: string;
    progress_pct: number;
    task_count: number;
    done_count: number;
    remaining_count: number;
    waiting_count: number;
    crucial_count: number;
    oldest_wait_days: number;
    crucial_remaining: CrucialTask[];
  };
  my_membership: {
    role: ProjectRole | 'viewer';
    status: ProjectMembershipStatus;
    can_edit: boolean;
    view_reason: ProjectViewReason;
  };
  members: WorkspaceMember[];
  tasks: WorkspaceTask[];
  activity: WorkspaceActivity[];
};

export type WorkspaceColleague = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  department: string | null;
  avatar_url: string | null;
};

function rpcError(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Something went wrong.');
}

export async function listProjects(): Promise<WorkspaceProjectListItem[]> {
  const { data, error } = await db.rpc('workspace_list_projects');
  if (error) rpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function getProject(projectId: string): Promise<WorkspaceProjectDetail> {
  const { data, error } = await db.rpc('workspace_get_project', { _project_id: projectId });
  if (error) rpcError(error);
  return data as WorkspaceProjectDetail;
}

export async function companyDirectory(): Promise<WorkspaceColleague[]> {
  const { data, error } = await db.rpc('workspace_company_directory');
  if (error) rpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function createProject(payload: {
  name: string;
  description?: string;
  dueDate?: string | null;
  priority?: PlannerPriority;
  status?: PlannerStatus;
}): Promise<string> {
  const { data, error } = await db.rpc('workspace_create_project', {
    _name: payload.name,
    _description: payload.description ?? null,
    _due_date: payload.dueDate || null,
  });
  if (error) rpcError(error);
  const id = data as string;
  if (payload.priority || payload.status) {
    await setProjectPlan(id, payload.priority ?? 'medium', payload.status ?? 'not_started');
  }
  return id;
}

export async function setProjectPlan(
  projectId: string,
  priority: PlannerPriority,
  status: PlannerStatus,
): Promise<void> {
  const { error } = await db.rpc('workspace_set_project_plan', {
    _project_id: projectId,
    _priority: priority,
    _status: status,
  });
  if (error) rpcError(error);
}

export async function inviteMember(projectId: string, employeeId: string): Promise<void> {
  const { error } = await db.rpc('workspace_invite_member', {
    _project_id: projectId,
    _employee_id: employeeId,
  });
  if (error) rpcError(error);
}

export async function respondInvite(projectId: string, accept: boolean): Promise<void> {
  const { error } = await db.rpc('workspace_respond_invite', {
    _project_id: projectId,
    _accept: accept,
  });
  if (error) rpcError(error);
}

export async function createTask(payload: {
  projectId: string;
  title: string;
  notes?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  cruciality?: TaskCruciality;
}): Promise<string> {
  const { data, error } = await db.rpc('workspace_create_task', {
    _project_id: payload.projectId,
    _title: payload.title,
    _notes: payload.notes ?? null,
    _assignee_id: payload.assigneeId || null,
    _due_date: payload.dueDate || null,
    _cruciality: payload.cruciality ?? 'medium',
  });
  if (error) rpcError(error);
  return data as string;
}

export async function updateTask(payload: {
  taskId: string;
  flowState: TaskFlowState;
  cruciality: TaskCruciality;
  waitingOn?: string | null;
  lastMovement?: string | null;
  blockedOnTaskId?: string | null;
}): Promise<void> {
  const { error } = await db.rpc('workspace_update_task', {
    _task_id: payload.taskId,
    _flow_state: payload.flowState,
    _cruciality: payload.cruciality,
    _waiting_on: payload.waitingOn ?? null,
    _last_movement: payload.lastMovement ?? null,
    _blocked_on_task_id: payload.blockedOnTaskId || null,
  });
  if (error) rpcError(error);
}

export async function setTaskProgress(taskId: string, progress: number): Promise<void> {
  const { error } = await db.rpc('workspace_set_task_progress', {
    _task_id: taskId,
    _progress: progress,
  });
  if (error) rpcError(error);
}

export async function delegateTask(taskId: string, toEmployeeId: string, note?: string): Promise<void> {
  const { error } = await db.rpc('workspace_delegate_task', {
    _task_id: taskId,
    _to_employee_id: toEmployeeId,
    _note: note ?? null,
  });
  if (error) rpcError(error);
}

export type PlannerStatus = 'not_started' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
export type PlannerPriority = 'low' | 'medium' | 'high' | 'critical';

export type PlannerObjective = {
  id: string;
  parent_id?: string | null;
  parent_title?: string | null;
  title: string;
  priority: PlannerPriority;
  status: PlannerStatus;
  due_date: string | null;
  locked: boolean;
  weight: number;
  progress_pct: number;
  child_count: number;
  child_titles: string[];
};

export type PlannerKeyResult = {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  company_objective_id: string | null;
  unit_objective_id: string | null;
  parent_title: string | null;
  priority: PlannerPriority;
  status: PlannerStatus;
  due_date: string | null;
  weight: number;
  progress_pct: number;
  project_count: number;
  task_count: number;
  can_edit: boolean;
};

export type PlannerTaskRow = {
  id: string;
  title: string;
  project_id: string;
  project_name: string;
  also_on: { id: string; name: string }[];
  key_result_title: string | null;
  assignee_name: string;
  due_date: string | null;
  priority: PlannerPriority;
  status: PlannerStatus;
  next_action: string | null;
};

export type PlannerBoard = {
  period: string;
  can_manage_objectives: boolean;
  is_leadership: boolean;
  objectives_locked: boolean;
  lock_on: string | null;
  company_objectives: PlannerObjective[];
  unit_objectives: PlannerObjective[];
  key_results: PlannerKeyResult[];
  project_links: { id: string; key_result_id: string | null; priority?: PlannerPriority; status?: PlannerStatus; weight?: number }[];
  tasks: PlannerTaskRow[];
};

export async function getPlanner(): Promise<PlannerBoard> {
  const { data, error } = await db.rpc('workspace_get_planner');
  if (error) rpcError(error);
  const row = (data ?? {}) as PlannerBoard;
  return {
    period: row.period,
    can_manage_objectives: Boolean(row.can_manage_objectives),
    is_leadership: Boolean(row.is_leadership),
    objectives_locked: Boolean(row.objectives_locked),
    lock_on: row.lock_on ?? null,
    company_objectives: (row.company_objectives ?? []).map((item) => ({ ...item, child_titles: item.child_titles ?? [] })),
    unit_objectives: (row.unit_objectives ?? []).map((item) => ({ ...item, child_titles: item.child_titles ?? [] })),
    key_results: row.key_results ?? [],
    project_links: row.project_links ?? [],
    tasks: (row.tasks ?? []).map((task) => ({
      ...task,
      also_on: Array.isArray(task.also_on) ? task.also_on : [],
    })),
  };
}

export type PlannerWeightItem = {
  id: string;
  level: 'objective' | 'key_result' | 'project' | 'task';
  title: string;
  priority: string;
  status: string;
  due_date: string | null;
  weight?: number;
};

function ruleWeight(item: PlannerWeightItem) {
  const base = item.priority === 'critical' ? 4 : item.priority === 'high' ? 3 : item.priority === 'low' ? 1 : 2;
  let weight = base;
  if (item.status === 'blocked') weight += 1;
  if (item.due_date && item.status !== 'done' && item.status !== 'cancelled') {
    const due = new Date(`${item.due_date}T12:00:00`);
    const days = (due.getTime() - Date.now()) / 86400000;
    if (days <= 7) weight += 1;
  }
  return Math.max(1, Math.min(6, weight));
}

export async function suggestPlannerWeights(items: PlannerWeightItem[]): Promise<{ items: PlannerWeightItem[]; source: 'model' | 'rules' }> {
  const rules = items.map((item) => ({ ...item, weight: ruleWeight(item) }));
  try {
    const { data, error } = await supabase.functions.invoke('planner-weights', { body: { items } });
    const suggested = Array.isArray(data?.items) ? data.items as PlannerWeightItem[] : [];
    if (!error && suggested.length > 0) {
      return { items: suggested, source: data?.source === 'rules' ? 'rules' : 'model' };
    }
  } catch {
    // The rule weights still apply when the model is unavailable.
  }
  return { items: rules, source: 'rules' };
}

export async function applyPlannerWeights(items: { id: string; level: string; weight: number }[]): Promise<number> {
  const { data, error } = await db.rpc('workspace_apply_weights', { _items: items });
  if (error) rpcError(error);
  return Number(data ?? 0);
}

export async function linkTaskToProject(taskId: string, projectId: string): Promise<void> {
  const { error } = await db.rpc('workspace_link_task_project', {
    _task_id: taskId,
    _project_id: projectId,
  });
  if (error) rpcError(error);
}

export async function unlinkTaskFromProject(taskId: string, projectId: string): Promise<void> {
  const { error } = await db.rpc('workspace_unlink_task_project', {
    _task_id: taskId,
    _project_id: projectId,
  });
  if (error) rpcError(error);
}

export async function saveObjective(payload: {
  id?: string | null;
  level: 'company' | 'unit';
  parentId?: string | null;
  title: string;
  priority: string;
  status: string;
  dueDate?: string | null;
}): Promise<void> {
  const { error } = await db.rpc('workspace_save_objective', {
    _id: payload.id ?? null,
    _level: payload.level,
    _parent_id: payload.parentId ?? null,
    _title: payload.title,
    _priority: payload.priority,
    _status: payload.status,
    _due_date: payload.dueDate || null,
  });
  if (error) rpcError(error);
}

export async function deleteObjective(id: string): Promise<void> {
  const { error } = await db.rpc('workspace_delete_objective', { _id: id });
  if (error) rpcError(error);
}

export async function lockObjectives(locked: boolean): Promise<void> {
  const { error } = await db.rpc('workspace_lock_objectives', { _locked: locked });
  if (error) rpcError(error);
}

export async function saveKeyResult(payload: {
  id?: string | null;
  title: string;
  companyObjectiveId?: string | null;
  unitObjectiveId?: string | null;
  priority: string;
  status: string;
  dueDate?: string | null;
  ownerId?: string | null;
}): Promise<void> {
  const { error } = await db.rpc('workspace_save_key_result', {
    _id: payload.id ?? null,
    _title: payload.title,
    _company_objective_id: payload.companyObjectiveId ?? null,
    _unit_objective_id: payload.unitObjectiveId ?? null,
    _priority: payload.priority,
    _status: payload.status,
    _due_date: payload.dueDate || null,
    _owner_id: payload.ownerId ?? null,
  });
  if (error) rpcError(error);
}

export async function deleteKeyResult(id: string): Promise<void> {
  const { error } = await db.rpc('workspace_delete_key_result', { _id: id });
  if (error) rpcError(error);
}

export async function setProjectKeyResult(projectId: string, keyResultId: string | null): Promise<void> {
  const { error } = await db.rpc('workspace_set_project_key_result', {
    _project_id: projectId,
    _key_result_id: keyResultId,
  });
  if (error) rpcError(error);
}

export async function respondDelegation(delegationId: string, accept: boolean): Promise<void> {
  const { error } = await db.rpc('workspace_respond_delegation', {
    _delegation_id: delegationId,
    _accept: accept,
  });
  if (error) rpcError(error);
}
