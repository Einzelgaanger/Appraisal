import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  FolderKanban,
  Loader2,
  Plus,
  ScrollText,
  Send,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  companyDirectory,
  createProject,
  createTask,
  delegateTask,
  getProject,
  inviteMember,
  listProjects,
  respondDelegation,
  respondInvite,
  setTaskProgress,
  type WorkspaceColleague,
  type WorkspaceProjectDetail,
  type WorkspaceProjectListItem,
} from './workspaceApi';

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function dueLabel(value: string | null | undefined) {
  const label = formatDate(value);
  if (!label) return 'No due date';
  return `Due ${label}`;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    'project.created': 'created the project',
    'member.invited': 'invited a teammate',
    'member.joined': 'joined the project',
    'member.declined': 'declined an invite',
    'task.created': 'added a task',
    'task.progress': 'updated progress',
    'task.delegated': 'delegated a task',
    'task.accepted': 'accepted a delegated task',
    'task.declined': 'declined a delegated task',
  };
  return map[action] ?? action.replace('.', ' ');
}

type Props = {
  employeeId: string | null;
  projectId: string | null;
  onOpenProject: (id: string | null) => void;
};

export default function ProjectsWorkspace({ employeeId, projectId, onOpenProject }: Props) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<WorkspaceProjectListItem[]>([]);
  const [detail, setDetail] = useState<WorkspaceProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [directory, setDirectory] = useState<WorkspaceColleague[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDue, setNewDue] = useState('');
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    const rows = await listProjects();
    setProjects(rows);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await getProject(id);
      setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rows, people] = await Promise.all([listProjects(), companyDirectory()]);
        if (!cancelled) {
          setProjects(rows);
          setDirectory(people);
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not load projects');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setDetail(null);
      return;
    }
    void loadDetail(projectId).catch((e) => {
      toast.error(e instanceof Error ? e.message : 'Could not open project');
      onOpenProject(null);
    });
    // onOpenProject is used only for the not-found path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, loadDetail]);

  const pendingInvites = useMemo(
    () => projects.filter((p) => p.my_status === 'invited'),
    [projects],
  );
  const myProjects = useMemo(
    () => projects.filter((p) => p.my_status === 'active'),
    [projects],
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const id = await createProject({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        dueDate: newDue || null,
      });
      setCreateOpen(false);
      setNewName('');
      setNewDescription('');
      setNewDue('');
      await loadList();
      onOpenProject(id);
      toast.success('Project created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create project');
    } finally {
      setSaving(false);
    }
  };

  if (!employeeId) {
    return (
      <div className="surface-card p-6">
        <h2 className="font-display text-xl font-medium">Projects</h2>
        <p className="mt-2 text-sm text-muted-foreground">Finish your profile so we know which company this workspace belongs to.</p>
      </div>
    );
  }

  if (projectId) {
    return (
      <ProjectDetail
        employeeId={employeeId}
        detail={detail}
        loading={detailLoading}
        directory={directory}
        onBack={() => onOpenProject(null)}
        onReload={async () => {
          if (projectId) await loadDetail(projectId);
          await loadList();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">◉ Projects</p>
          <h2 className="font-display mt-1 text-2xl font-medium">Company workspace</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Create a project, invite people in this company, assign or delegate tasks, and track progress. Other subsidiaries cannot see this.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </div>

      {pendingInvites.length > 0 && (
        <section className="surface-card p-4 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Invites waiting for you</p>
          {pendingInvites.map((project) => (
            <InviteRow
              key={project.id}
              project={project}
              onDone={async () => {
                await loadList();
              }}
            />
          ))}
        </section>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading projects
        </div>
      ) : myProjects.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="font-display mt-4 text-lg font-medium">No projects yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Start one for this company. People you invite will see it after they accept.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {myProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="surface-card p-5 text-left transition-shadow hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-medium truncate">{project.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dueLabel(project.due_date)} · {project.member_count} {project.member_count === 1 ? 'person' : 'people'} · {project.owner_name ?? 'Owner'}
                  </p>
                </div>
                <Badge variant="secondary">{project.progress_pct}%</Badge>
              </div>
              <Progress value={project.progress_pct} className="mt-3 h-2" />
              <p className="mt-2 text-[11px] text-muted-foreground">
                {project.done_count}/{project.task_count} tasks done
              </p>
            </button>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Only people in your company can be invited. Progress is the average of task progress.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Textarea placeholder="What is this for? (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            <div>
              <label className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Due date</label>
              <Input className="mt-1" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={saving || !newName.trim()} onClick={() => void handleCreate()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteRow({
  project,
  onDone,
}: {
  project: WorkspaceProjectListItem;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const act = async (accept: boolean) => {
    setBusy(true);
    try {
      await respondInvite(project.id, accept);
      toast.success(accept ? 'You joined the project' : 'Invite declined');
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not respond');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{project.name}</p>
        <p className="text-[11px] text-muted-foreground">{project.owner_name} invited you · {dueLabel(project.due_date)}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(false)}>Decline</Button>
        <Button size="sm" disabled={busy} onClick={() => void act(true)}>Accept</Button>
      </div>
    </div>
  );
}

function ProjectDetail({
  employeeId,
  detail,
  loading,
  directory,
  onBack,
  onReload,
}: {
  employeeId: string;
  detail: WorkspaceProjectDetail | null;
  loading: boolean;
  directory: WorkspaceColleague[];
  onBack: () => void;
  onReload: () => Promise<void>;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [assigneeId, setAssigneeId] = useState(employeeId);
  const [taskDue, setTaskDue] = useState('');
  const [invitee, setInvitee] = useState('');
  const [busy, setBusy] = useState(false);

  const pendingForMe = useMemo(() => {
    if (!detail) return [];
    return detail.tasks.filter(
      (t) => t.pending_delegation?.to_employee_id === employeeId,
    );
  }, [detail, employeeId]);

  const activeMembers = detail?.members.filter((m) => m.status === 'active') ?? [];
  const inviteCandidates = directory.filter(
    (person) => !detail?.members.some((m) => m.employee_id === person.id && m.status !== 'declined'),
  );

  const handleCreateTask = async () => {
    if (!detail || !title.trim()) return;
    setBusy(true);
    try {
      await createTask({
        projectId: detail.project.id,
        title: title.trim(),
        notes: notes.trim() || undefined,
        assigneeId,
        dueDate: taskDue || null,
      });
      setTaskOpen(false);
      setTitle('');
      setNotes('');
      setTaskDue('');
      setAssigneeId(employeeId);
      await onReload();
      toast.success('Task added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add task');
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async () => {
    if (!detail || !invitee) return;
    setBusy(true);
    try {
      await inviteMember(detail.project.id, invitee);
      setInviteOpen(false);
      setInvitee('');
      await onReload();
      toast.success('Invite sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not invite');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening project
      </div>
    );
  }

  if (!detail) return null;

  const invited = detail.my_membership.status === 'invited';

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All projects
      </button>

      <div className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">◉ Project</p>
            <h2 className="font-display mt-1 text-2xl font-medium">{detail.project.name}</h2>
            {detail.project.description && (
              <p className="mt-2 text-sm text-muted-foreground">{detail.project.description}</p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> {dueLabel(detail.project.due_date)}
            </p>
          </div>
          <Badge variant="green">{detail.project.progress_pct}% complete</Badge>
        </div>
        <Progress value={detail.project.progress_pct} className="h-2.5" />
      </div>

      {invited ? (
        <div className="surface-card p-5">
          <p className="text-sm">Accept the invite to see tasks and the activity log.</p>
        </div>
      ) : (
        <>
          {pendingForMe.length > 0 && (
            <section className="surface-card p-4 space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Delegated to you</p>
              {pendingForMe.map((task) => (
                <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-[11px] text-muted-foreground">From {task.assignee_name}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!task.pending_delegation) return;
                        void respondDelegation(task.pending_delegation.id, false)
                          .then(async () => {
                            toast.success('Declined');
                            await onReload();
                          })
                          .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not decline'));
                      }}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!task.pending_delegation) return;
                        void respondDelegation(task.pending_delegation.id, true)
                          .then(async () => {
                            toast.success('You now own this task');
                            await onReload();
                          })
                          .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not accept'));
                      }}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-medium">Tasks</h3>
                <Button size="sm" className="gap-1.5" onClick={() => setTaskOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Task
                </Button>
              </div>
              {detail.tasks.length === 0 ? (
                <div className="surface-card p-6 text-sm text-muted-foreground">No tasks yet. Add one for yourself or someone on the project.</div>
              ) : (
                detail.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    employeeId={employeeId}
                    members={activeMembers}
                    onReload={onReload}
                  />
                ))
              )}
            </section>

            <aside className="space-y-5">
              <section className="surface-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="h-4 w-4" /> People
                  </h3>
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5" /> Invite
                  </Button>
                </div>
                <ul className="space-y-2">
                  {detail.members.map((member) => (
                    <li key={member.employee_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{member.name}</span>
                      <Badge variant={member.status === 'active' ? 'secondary' : 'outline'}>
                        {member.status === 'invited' ? 'Invited' : member.role}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="surface-card p-4 space-y-3">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <ScrollText className="h-4 w-4" /> Activity
                </h3>
                {detail.activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing logged yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {detail.activity.map((entry) => (
                      <li key={entry.id} className="text-xs leading-snug">
                        <span className="font-medium text-foreground">{entry.actor_name}</span>{' '}
                        <span className="text-muted-foreground">{actionLabel(entry.action)}</span>
                        {typeof entry.detail?.title === 'string' && (
                          <span className="text-foreground"> — {entry.detail.title}</span>
                        )}
                        {typeof entry.detail?.progress === 'number' && (
                          <span className="text-muted-foreground"> ({entry.detail.progress}%)</span>
                        )}
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Assign it to yourself or another active member. They can later delegate it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div>
              <label className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Assign to</label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeMembers.map((member) => (
                    <SelectItem key={member.employee_id} value={member.employee_id}>
                      {member.name}{member.employee_id === employeeId ? ' (you)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Due date</label>
              <Input className="mt-1" type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button disabled={busy || !title.trim()} onClick={() => void handleCreateTask()}>Add task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>People from this company only. They must accept before they can see tasks.</DialogDescription>
          </DialogHeader>
          <Select value={invitee} onValueChange={setInvitee}>
            <SelectTrigger><SelectValue placeholder="Choose a colleague" /></SelectTrigger>
            <SelectContent>
              {inviteCandidates.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}{person.role ? ` · ${person.role}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {inviteCandidates.length === 0 && (
            <p className="text-xs text-muted-foreground">Everyone in this company is already on the project, or there is nobody else to invite.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button disabled={busy || !invitee} onClick={() => void handleInvite()}>Send invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskCard({
  task,
  employeeId,
  members,
  onReload,
}: {
  task: WorkspaceProjectDetail['tasks'][number];
  employeeId: string;
  members: WorkspaceProjectDetail['members'];
  onReload: () => Promise<void>;
}) {
  const canEdit = task.assignee_id === employeeId || task.created_by === employeeId;
  const canDelegate = task.assignee_id === employeeId && !task.pending_delegation;
  const [progress, setProgress] = useState(task.progress);
  const [saving, setSaving] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateTo, setDelegateTo] = useState('');

  useEffect(() => {
    setProgress(task.progress);
  }, [task.progress]);

  const saveProgress = async (value: number) => {
    setSaving(true);
    try {
      await setTaskProgress(task.id, value);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update progress');
      setProgress(task.progress);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{task.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {task.assignee_name} · {dueLabel(task.due_date)}
            {task.pending_delegation ? ` · pending ${task.pending_delegation.to_name}` : ''}
          </p>
        </div>
        <Badge variant={task.status === 'done' ? 'green' : task.status === 'in_progress' ? 'secondary' : 'outline'}>
          {task.status === 'done' ? 'Done' : task.status === 'in_progress' ? 'In progress' : 'To do'}
        </Badge>
      </div>
      {task.notes && <p className="text-xs text-muted-foreground">{task.notes}</p>}
      <div className="flex items-center gap-3">
        <Slider
          disabled={!canEdit || saving}
          value={[progress]}
          max={100}
          step={5}
          onValueChange={(v) => setProgress(v[0] ?? 0)}
          onValueCommit={(v) => {
            const next = v[0] ?? 0;
            if (next !== task.progress) void saveProgress(next);
          }}
          className="flex-1"
        />
        <span className="w-10 text-right text-xs font-mono">{progress}%</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {canEdit && task.status !== 'done' && (
          <Button size="sm" variant="outline" className="h-8 gap-1" disabled={saving} onClick={() => void saveProgress(100)}>
            <Check className="h-3.5 w-3.5" /> Mark done
          </Button>
        )}
        {canDelegate && (
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setDelegateOpen(true)}>
            <Send className="h-3.5 w-3.5" /> Delegate
          </Button>
        )}
      </div>

      <Dialog open={delegateOpen} onOpenChange={setDelegateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delegate “{task.title}”</DialogTitle>
            <DialogDescription>They must accept before ownership moves. Until then, it stays with you.</DialogDescription>
          </DialogHeader>
          <Select value={delegateTo} onValueChange={setDelegateTo}>
            <SelectTrigger><SelectValue placeholder="Choose a teammate" /></SelectTrigger>
            <SelectContent>
              {members
                .filter((m) => m.employee_id !== employeeId)
                .map((member) => (
                  <SelectItem key={member.employee_id} value={member.employee_id}>{member.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegateOpen(false)}><X className="h-4 w-4" /> Cancel</Button>
            <Button
              disabled={!delegateTo}
              onClick={() => {
                void delegateTask(task.id, delegateTo)
                  .then(async () => {
                    toast.success('Delegation sent');
                    setDelegateOpen(false);
                    setDelegateTo('');
                    await onReload();
                  })
                  .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not delegate'));
              }}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
