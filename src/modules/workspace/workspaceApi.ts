import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type ProjectMembershipStatus = 'invited' | 'active' | 'declined';
export type ProjectRole = 'owner' | 'member';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export type WorkspaceProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  created_at: string;
  created_by: string;
  my_role: ProjectRole;
  my_status: ProjectMembershipStatus;
  owner_id: string | null;
  owner_name: string | null;
  progress_pct: number;
  task_count: number;
  done_count: number;
  member_count: number;
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
    created_at: string;
    created_by: string;
    progress_pct: number;
    task_count: number;
  };
  my_membership: { role: ProjectRole; status: ProjectMembershipStatus };
  members: WorkspaceMember[];
  tasks: WorkspaceTask[];
  activity: WorkspaceActivity[];
};

export type WorkspaceColleague = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
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
}): Promise<string> {
  const { data, error } = await db.rpc('workspace_create_project', {
    _name: payload.name,
    _description: payload.description ?? null,
    _due_date: payload.dueDate || null,
  });
  if (error) rpcError(error);
  return data as string;
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
}): Promise<string> {
  const { data, error } = await db.rpc('workspace_create_task', {
    _project_id: payload.projectId,
    _title: payload.title,
    _notes: payload.notes ?? null,
    _assignee_id: payload.assigneeId || null,
    _due_date: payload.dueDate || null,
  });
  if (error) rpcError(error);
  return data as string;
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

export async function respondDelegation(delegationId: string, accept: boolean): Promise<void> {
  const { error } = await db.rpc('workspace_respond_delegation', {
    _delegation_id: delegationId,
    _accept: accept,
  });
  if (error) rpcError(error);
}
