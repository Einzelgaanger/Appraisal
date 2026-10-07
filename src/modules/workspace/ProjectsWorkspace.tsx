import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ListTodo,
  Rocket,
  Loader2,
  Plus,
  ScrollText,
  Send,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import PlannerLadder from '@/modules/workspace/PlannerLadder';
import {
  companyDirectory,
  createProject,
  createTask,
  getPlanner,
  setProjectPlan,
  delegateTask,
  getProject,
  inviteMember,
  listProjects,
  CRUCIAL_LABELS,
  FLOW_LABELS,
  respondDelegation,
  respondInvite,
  setTaskProgress,
  updateTask,
  type PlannerKeyResult,
  type PlannerPriority,
  type PlannerStatus,
  type TaskCruciality,
  type TaskFlowState,
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

function formatWhen(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function accessLabel(reason: string | undefined) {
  if (reason === 'line_manager') return 'Line manager';
  if (reason === 'leadership') return 'Leadership';
  return null;
}

const softButton = 'h-10 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal';

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-foreground/80">{children}</p>;
}

function CompletionRing({ value, size = 84 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = size > 96 ? 8 : 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${pct}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display-number text-[15px] leading-none text-foreground">{pct}<span className="text-[10px]">%</span></span>
        <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">Done</span>
      </div>
    </div>
  );
}

function FigureBoard({
  done,
  remaining,
  crucial,
  waiting,
}: {
  done: number;
  remaining: number;
  crucial: number;
  waiting: number;
}) {
  const tiles = [
    { label: 'Done', value: done, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-900', chip: 'rounded-full bg-emerald-100 text-emerald-800' },
    { label: 'Open', value: remaining, icon: ListTodo, tone: 'bg-teal-50 text-teal-900', chip: 'rounded-2xl bg-teal-100 text-teal-800' },
    {
      label: 'Crucial',
      value: crucial,
      icon: AlertTriangle,
      tone: crucial > 0 ? 'bg-rose-50 text-rose-900' : 'bg-muted/50 text-muted-foreground',
      chip: crucial > 0 ? 'rounded-xl bg-rose-100 text-rose-800' : 'rounded-xl bg-white text-muted-foreground',
    },
    {
      label: 'Waiting',
      value: waiting,
      icon: Clock3,
      tone: waiting > 0 ? 'bg-amber-50 text-amber-950' : 'bg-muted/50 text-muted-foreground',
      chip: waiting > 0 ? 'rounded-full bg-amber-100 text-amber-900' : 'rounded-full bg-white text-muted-foreground',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div key={tile.label} className={cn('flex items-center gap-2.5 rounded-2xl px-3 py-3', tile.tone)}>
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center', tile.chip)}>
              <Icon className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="min-w-0">
              <span className="font-display block text-xl font-semibold leading-none">{tile.value}</span>
              <span className="mt-1 block text-[13px] font-medium">{tile.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CrucialLine({
  title,
  cruciality,
  meta,
}: {
  title: string;
  cruciality: TaskCruciality;
  meta: string;
}) {
  const critical = cruciality === 'critical';
  return (
    <li className={cn(
      'flex items-center gap-2.5 rounded-md px-2.5 py-2',
      critical ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning-foreground',
    )}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
      <span className="shrink-0 text-[12px] font-medium">{meta}</span>
    </li>
  );
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
    'task.updated': 'updated where the task stands',
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
  const [newPriority, setNewPriority] = useState<PlannerPriority>('medium');
  const [newStatus, setNewStatus] = useState<PlannerStatus>('not_started');
  const [newKeyResultId, setNewKeyResultId] = useState('none');
  const [keyResults, setKeyResults] = useState<PlannerKeyResult[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    void getPlanner()
      .then((board) => {
        if (!cancelled) setKeyResults(board.key_results);
      })
      .catch(() => {
        if (!cancelled) setKeyResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

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
        priority: newPriority,
        status: newStatus,
        keyResultId: newKeyResultId === 'none' ? null : newKeyResultId,
      });
      setCreateOpen(false);
      setNewName('');
      setNewDescription('');
      setNewDue('');
      setNewPriority('medium');
      setNewStatus('not_started');
      setNewKeyResultId('none');
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
      <div className="surface-card">
        <h2 className="font-display text-2xl font-semibold">Company register</h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Finish your profile so this workspace can be placed in the right company.</p>
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
        projectChoices={projects.filter((row) => row.can_edit)}
        onBack={() => onOpenProject(null)}
        onReload={async () => {
          if (projectId) await loadDetail(projectId);
          await loadList();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="app-sticky-subnav -mx-4 bg-background/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-5 ring-1 ring-sky-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-800">
            <Rocket className="h-5 w-5" />
          </span>
          <div className="max-w-2xl">
            <h2 className="font-display text-[1.65rem] font-semibold">Company objectives to tasks</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Work is entered by hand. Completion rolls upward. Members, their line manager, and company leadership can open a project.
            </p>
          </div>
        </div>
        <Button className={cn(softButton, 'shrink-0 gap-2 bg-teal-500 text-white hover:bg-teal-600')} onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </div>
      </div>

      {pendingInvites.length > 0 && (
        <section className="surface-card !p-0">
          <div className="border-b border-border px-5 py-3">
            <p className="text-sm font-medium">Invitations</p>
          </div>
          <div className="divide-y divide-border">
            {pendingInvites.map((project) => (
              <InviteRow
                key={project.id}
                project={project}
                onDone={async () => {
                  await loadList();
                }}
              />
            ))}
          </div>
        </section>
      )}

      <PlannerLadder projects={myProjects} directory={directory} onOpenProject={onOpenProject} onChanged={loadList} onAddProject={() => setCreateOpen(true)} />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the register
        </div>
      ) : myProjects.length === 0 ? (
        <div className="surface-card px-6 py-14 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground/70" strokeWidth={1.25} />
          <h3 className="font-display mt-4 text-lg font-medium tracking-tight">No projects on the register</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Open one for this company. People on it, their line manager, and company leadership will be able to read it.
          </p>
          <Button className={cn(softButton, 'mt-4 gap-2 bg-teal-500 text-white hover:bg-teal-600')} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {myProjects.map((project) => {
            const access = accessLabel(project.view_reason);
            const crucial = project.crucial_remaining ?? [];
            return (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProject(project.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenProject(project.id);
                  }
                }}
                className="cursor-pointer space-y-4 rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                <div className="flex items-center gap-4">
                  <CompletionRing value={project.progress_pct ?? 0} />
                  <div className="min-w-0 flex-1">
                    {access && (
                      <p className="text-[12px] font-medium text-teal-700">{access}</p>
                    )}
                    <h3 className={cn('font-display truncate text-xl font-semibold', access && 'mt-1')}>{project.name}</h3>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{project.owner_name ?? 'Owner'}</span>
                      <span className="text-border">·</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{project.member_count}</span>
                      <span className="text-border">·</span>
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{dueLabel(project.due_date)}</span>
                    </p>
                  </div>
                </div>
                <FigureBoard
                  done={project.done_count ?? 0}
                  remaining={project.remaining_count ?? 0}
                  crucial={project.crucial_count ?? 0}
                  waiting={project.waiting_count ?? 0}
                />
                {crucial.length > 0 && (
                  <ul className="space-y-1.5">
                    {crucial.slice(0, 3).map((item) => (
                      <CrucialLine
                        key={item.id}
                        title={item.title}
                        cruciality={item.cruciality}
                        meta={`${CRUCIAL_LABELS[item.cruciality]} · ${FLOW_LABELS[item.flow_state]}${item.wait_days > 0 ? ` · ${item.wait_days}d` : ''}`}
                      />
                    ))}
                  </ul>
                )}
                {(project.oldest_wait_days ?? 0) > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    Oldest wait, {project.oldest_wait_days} working days. Weekends are excluded.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Invitations stay inside this company. Completion uses each task’s weight, and priority is the starting weight.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <FieldLabel>Name</FieldLabel>
              <Input placeholder="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Purpose</FieldLabel>
              <Textarea placeholder="Optional" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel>Priority</FieldLabel>
                <Select value={newPriority} onValueChange={(value) => setNewPriority(value as PlannerPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Status</FieldLabel>
                <Select value={newStatus} onValueChange={(value) => setNewStatus(value as PlannerStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Key result</FieldLabel>
              <Select value={newKeyResultId} onValueChange={setNewKeyResultId}>
                <SelectTrigger><SelectValue placeholder="Link to a key result" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No key result</SelectItem>
                  {keyResults.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.parent_title ? `${row.title} · ${row.parent_title}` : row.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {keyResults.length === 0 && (
                <p className="text-xs text-muted-foreground">No key results in this company yet. You can still create the project and link it later.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Due date</FieldLabel>
              <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className={softButton} onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className={cn(softButton, 'bg-teal-500 text-white hover:bg-teal-600')} disabled={saving || !newName.trim()} onClick={() => void handleCreate()}>
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
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{project.owner_name} · {dueLabel(project.due_date)}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(false)}>Decline</Button>
        <Button size="sm" variant="green" disabled={busy} onClick={() => void act(true)}>Accept</Button>
      </div>
    </div>
  );
}

function ProjectDetail({
  employeeId,
  detail,
  loading,
  directory,
  projectChoices,
  onBack,
  onReload,
}: {
  employeeId: string;
  detail: WorkspaceProjectDetail | null;
  loading: boolean;
  directory: WorkspaceColleague[];
  projectChoices: WorkspaceProjectListItem[];
  onBack: () => void;
  onReload: () => Promise<void>;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [assigneeId, setAssigneeId] = useState(employeeId);
  const [taskDue, setTaskDue] = useState('');
  const [taskCruciality, setTaskCruciality] = useState<TaskCruciality>('medium');
  const [taskProjectId, setTaskProjectId] = useState('');

  useEffect(() => {
    if (detail?.project.id) setTaskProjectId(detail.project.id);
  }, [detail?.project.id]);
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

  const taskProjects = useMemo(() => {
    const rows = projectChoices.map((row) => ({ id: row.id, name: row.name }));
    if (detail && !rows.some((row) => row.id === detail.project.id)) {
      rows.unshift({ id: detail.project.id, name: detail.project.name });
    }
    return rows;
  }, [detail, projectChoices]);

  const handleCreateTask = async () => {
    if (!detail || !title.trim() || !taskProjectId) return;
    setBusy(true);
    try {
      await createTask({
        projectId: taskProjectId,
        title: title.trim(),
        notes: notes.trim() || undefined,
        assigneeId,
        dueDate: taskDue || null,
        cruciality: taskCruciality,
      });
      setTaskOpen(false);
      setTitle('');
      setNotes('');
      setTaskDue('');
      setTaskCruciality('medium');
      setAssigneeId(employeeId);
      const linkedName = taskProjects.find((row) => row.id === taskProjectId)?.name;
      await onReload();
      toast.success(taskProjectId === detail.project.id || !linkedName ? 'Task added' : `Task added to ${linkedName}`);
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
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening the record
      </div>
    );
  }

  if (!detail) return null;

  const canEdit = detail.my_membership.can_edit ?? detail.my_membership.status === 'active';
  const viewReason = detail.my_membership.view_reason ?? 'member';
  const access = accessLabel(viewReason);
  const crucial = detail.project.crucial_remaining ?? [];

  return (
    <div className="space-y-8">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </button>

      <section className="surface-card space-y-5">
        <div className="flex flex-wrap items-center gap-5">
          <CompletionRing value={detail.project.progress_pct ?? 0} size={108} />
          <div className="min-w-0 flex-1">
            {access ? <p className="text-[12px] font-medium text-teal-700">{access}</p> : null}
            <h2 className="font-display mt-1 text-[1.75rem] font-semibold">{detail.project.name}</h2>
            {detail.project.description && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{detail.project.description}</p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> {dueLabel(detail.project.due_date)}
            </p>
            {canEdit ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Select
                  value={detail.project.priority || 'medium'}
                  onValueChange={(priority) => void setProjectPlan(detail.project.id, priority as PlannerPriority, (detail.project.status || 'not_started') as PlannerStatus).then(onReload).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not update priority'))}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={detail.project.status || 'not_started'}
                  onValueChange={(status) => void setProjectPlan(detail.project.id, (detail.project.priority || 'medium') as PlannerPriority, status as PlannerStatus).then(onReload).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not update status'))}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {(detail.project.priority || 'medium')} · {(detail.project.status || 'not_started').replace(/_/g, ' ')}
              </p>
            )}
            {viewReason === 'line_manager' && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Visible because someone on this project reports to you. The record is read only.</p>
            )}
            {viewReason === 'leadership' && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Visible to company leadership. The record is read only.</p>
            )}
          </div>
        </div>
        <FigureBoard
          done={detail.project.done_count ?? 0}
          remaining={detail.project.remaining_count ?? 0}
          crucial={detail.project.crucial_count ?? 0}
          waiting={detail.project.waiting_count ?? 0}
        />
        {((detail.project.oldest_wait_days ?? 0) > 0 || crucial.length > 0) && (
          <div className="space-y-3">
            {(detail.project.oldest_wait_days ?? 0) > 0 && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                Oldest wait, {detail.project.oldest_wait_days} working days. Weekends are excluded.
              </p>
            )}
            {crucial.length > 0 && (
              <ul className="space-y-1.5">
                {crucial.map((item) => (
                  <CrucialLine
                    key={item.id}
                    title={item.title}
                    cruciality={item.cruciality}
                    meta={`${CRUCIAL_LABELS[item.cruciality]} · ${FLOW_LABELS[item.flow_state]} · ${item.assignee_name}${item.wait_days > 0 ? ` · ${item.wait_days}d` : ''}`}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
        {!canEdit && (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            {detail.my_membership.status === 'invited'
              ? 'This is a reading copy. Accept the invitation to take part in the work.'
              : 'This is a reading copy. People on the project keep the tasks current.'}
          </p>
        )}
      </section>

      {(canEdit || detail.tasks.length > 0) && (
        <>
          {pendingForMe.length > 0 && (
            <section className="surface-card !p-0">
              <div className="border-b border-border px-5 py-3">
                <p className="text-sm font-medium text-foreground/80">Delegated to you</p>
              </div>
              {pendingForMe.map((task) => (
                <div key={task.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">From {task.assignee_name}</p>
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

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="space-y-4">
              <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="text-sm font-medium text-foreground/80">Work</p>
                  <h3 className="font-display mt-1 text-lg font-medium tracking-tight">Tasks</h3>
                </div>
                {canEdit && (
                  <Button size="sm" className="gap-1.5" onClick={() => { setTaskProjectId(detail.project.id); setTaskOpen(true); }}>
                    <Plus className="h-3.5 w-3.5" /> Task
                  </Button>
                )}
              </div>
              {detail.tasks.length === 0 ? (
                <div className="surface-card text-sm leading-relaxed text-muted-foreground">No tasks yet. Add one for yourself or for someone on the project.</div>
              ) : (
                detail.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    employeeId={employeeId}
                    members={activeMembers}
                    canEditProject={canEdit}
                    siblingTasks={detail.tasks}
                    onReload={onReload}
                  />
                ))
              )}
            </section>

            <aside className="space-y-4">
              <section className="surface-card !p-0">
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">
                    <Users className="h-3.5 w-3.5" /> People
                  </h3>
                  {canEdit && (
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setInviteOpen(true)}>
                      <UserPlus className="h-3.5 w-3.5" /> Invite
                    </Button>
                  )}
                </div>
                <ul className="divide-y divide-border">
                  {detail.members.map((member) => (
                    <li key={member.employee_id} className="flex items-center gap-3 px-5 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/60 text-[10px] font-medium tracking-wide text-foreground">
                        {initials(member.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{member.name}</span>
                        <span className="block text-[12px] text-muted-foreground">
                          {member.status === 'invited' ? 'Invited' : member.role}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="surface-card !p-0">
                <div className="flex items-center gap-1.5 border-b border-border px-5 py-3">
                  <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground/80">Activity</h3>
                </div>
                {detail.activity.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {detail.activity.map((entry) => (
                      <li key={entry.id} className="px-5 py-3 text-xs leading-relaxed">
                        <span className="font-medium text-foreground">{entry.actor_name}</span>{' '}
                        <span className="text-muted-foreground">{actionLabel(entry.action)}</span>
                        {typeof entry.detail?.title === 'string' && (
                          <span className="text-foreground"> — {entry.detail.title}</span>
                        )}
                        {typeof entry.detail?.progress === 'number' && (
                          <span className="text-muted-foreground"> ({entry.detail.progress}%)</span>
                        )}
                        <div className="mt-1 text-[12px] text-muted-foreground">
                          {formatWhen(entry.created_at)}
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
            <DialogDescription>Assign it to yourself or to another member. Ownership can be delegated later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <FieldLabel>Project</FieldLabel>
              <Select value={taskProjectId} onValueChange={setTaskProjectId}>
                <SelectTrigger><SelectValue placeholder="Link to a project" /></SelectTrigger>
                <SelectContent>
                  {taskProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Title</FieldLabel>
              <Input placeholder="What needs to be done" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Notes</FieldLabel>
              <Textarea placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Assign to</FieldLabel>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeMembers.map((member) => (
                    <SelectItem key={member.employee_id} value={member.employee_id}>
                      {member.name}{member.employee_id === employeeId ? ' (you)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Cruciality</FieldLabel>
              <Select value={taskCruciality} onValueChange={(value) => setTaskCruciality(value as TaskCruciality)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CRUCIAL_LABELS) as TaskCruciality[]).map((band) => (
                    <SelectItem key={band} value={band}>{CRUCIAL_LABELS[band]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Due date</FieldLabel>
              <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button disabled={busy || !title.trim() || !taskProjectId} onClick={() => void handleCreateTask()}>Add task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a colleague</DialogTitle>
            <DialogDescription>Colleagues in this company only. They may already read the project, and they join the work when they accept.</DialogDescription>
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
  canEditProject,
  siblingTasks,
  onReload,
}: {
  task: WorkspaceProjectDetail['tasks'][number];
  employeeId: string;
  members: WorkspaceProjectDetail['members'];
  canEditProject: boolean;
  siblingTasks: WorkspaceProjectDetail['tasks'];
  onReload: () => Promise<void>;
}) {
  const canEdit = canEditProject && (task.assignee_id === employeeId || task.created_by === employeeId);
  const canDelegate = canEdit && task.assignee_id === employeeId && !task.pending_delegation && task.flow_state !== 'done' && task.flow_state !== 'cancelled';
  const [progress, setProgress] = useState(task.progress);
  const [flow, setFlow] = useState<TaskFlowState>(task.flow_state ?? 'ready');
  const [cruciality, setCruciality] = useState<TaskCruciality>(task.cruciality ?? 'medium');
  const [waitingOn, setWaitingOn] = useState(task.waiting_on ?? '');
  const [movement, setMovement] = useState(task.last_movement ?? '');
  const [blockedOn, setBlockedOn] = useState(task.blocked_on_task_id ?? '');
  const [saving, setSaving] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateTo, setDelegateTo] = useState('');

  useEffect(() => {
    setFlow(task.flow_state ?? 'ready');
    setCruciality(task.cruciality ?? 'medium');
    setWaitingOn(task.waiting_on ?? '');
    setMovement(task.last_movement ?? '');
    setBlockedOn(task.blocked_on_task_id ?? '');
  }, [task.flow_state, task.cruciality, task.waiting_on, task.last_movement, task.blocked_on_task_id]);

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

  const critical = task.cruciality === 'critical';
  const high = task.cruciality === 'high';
  const settled = task.flow_state === 'done' || task.flow_state === 'cancelled';
  const blockedTitle = task.blocked_on_task_id
    ? siblingTasks.find((other) => other.id === task.blocked_on_task_id)?.title
    : null;

  return (
    <div className={cn(
      'surface-card !p-0',
      critical && !settled && 'border-l-4 border-l-destructive',
      high && !settled && 'border-l-4 border-l-warning',
      settled && 'opacity-75',
    )}>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium tracking-tight">{task.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {task.assignee_name} · {dueLabel(task.due_date)}
              {task.shared ? ' · also on this project' : ''}
              {task.pending_delegation ? ` · offered to ${task.pending_delegation.to_name}` : ''}
              {(task.wait_days ?? 0) > 0 ? ` · ${task.wait_days} working days` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {(critical || high) && (
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium normal-case tracking-normal',
                critical ? 'bg-destructive/10 text-destructive' : 'bg-warning/20 text-warning-foreground',
              )}>
                <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
                {CRUCIAL_LABELS[task.cruciality ?? 'medium']}
              </span>
            )}
            <span className="rounded-full bg-muted px-2 py-1 text-[12px] font-medium normal-case tracking-normal text-muted-foreground">
              {FLOW_LABELS[task.flow_state ?? 'ready']}
            </span>
          </div>
        </div>
        {task.notes && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{task.notes}</p>}
        {(task.waiting_on || blockedTitle || task.last_movement) && (
          <dl className="mt-3 grid gap-y-1.5 text-xs">
            {task.waiting_on && (
              <div className="grid grid-cols-[7.25rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">Waiting on</dt>
                <dd className="text-foreground">{task.waiting_on}</dd>
              </div>
            )}
            {blockedTitle && (
              <div className="grid grid-cols-[7.25rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">Depends on</dt>
                <dd className="text-foreground">{blockedTitle}</dd>
              </div>
            )}
            {task.last_movement && (
              <div className="grid grid-cols-[7.25rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">Last movement</dt>
                <dd className="text-foreground">{task.last_movement}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      {canEdit && (
        <div className="space-y-3 border-t border-border bg-muted/40 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel>State</FieldLabel>
              <Select value={flow} onValueChange={(value) => setFlow(value as TaskFlowState)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FLOW_LABELS) as TaskFlowState[]).map((state) => (
                    <SelectItem key={state} value={state}>{FLOW_LABELS[state]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Cruciality</FieldLabel>
              <Select value={cruciality} onValueChange={(value) => setCruciality(value as TaskCruciality)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CRUCIAL_LABELS) as TaskCruciality[]).map((band) => (
                    <SelectItem key={band} value={band}>{CRUCIAL_LABELS[band]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(flow === 'waiting_external' || flow === 'waiting_decision' || flow === 'waiting_internal') && (
              <div className="space-y-1.5 sm:col-span-2">
                <FieldLabel>{flow === 'waiting_external' ? 'Held outside by' : 'Held by'}</FieldLabel>
                <Input
                  placeholder={flow === 'waiting_external' ? 'Name or organisation' : 'Name'}
                  value={waitingOn}
                  onChange={(e) => setWaitingOn(e.target.value)}
                />
              </div>
            )}
            {flow === 'waiting_dependency' && (
              <div className="space-y-1.5 sm:col-span-2">
                <FieldLabel>Waiting on task</FieldLabel>
                <Select value={blockedOn || 'none'} onValueChange={(value) => setBlockedOn(value === 'none' ? '' : value)}>
                  <SelectTrigger><SelectValue placeholder="Choose a task" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None selected</SelectItem>
                    {siblingTasks.filter((other) => other.id !== task.id).map((other) => (
                      <SelectItem key={other.id} value={other.id}>{other.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <FieldLabel>Last movement</FieldLabel>
              <Input
                placeholder="What changed"
                value={movement}
                onChange={(e) => setMovement(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void updateTask({
                  taskId: task.id,
                  flowState: flow,
                  cruciality,
                  waitingOn,
                  lastMovement: movement,
                  blockedOnTaskId: flow === 'waiting_dependency' ? blockedOn || null : null,
                })
                  .then(async () => {
                    await onReload();
                  })
                  .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not update the task'))
                  .finally(() => setSaving(false));
              }}
            >
              Save record
            </Button>
            {task.status !== 'done' && (
              <Button size="sm" variant="outline" className="gap-1" disabled={saving} onClick={() => void saveProgress(100)}>
                <Check className="h-3.5 w-3.5" /> Mark done
              </Button>
            )}
            {canDelegate && (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setDelegateOpen(true)}>
                <Send className="h-3.5 w-3.5" /> Delegate
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 border-t border-border px-5 py-3">
        {canEdit ? (
          <Slider
            disabled={saving}
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
        ) : (
          <Progress value={progress} className="h-1 flex-1 rounded-none bg-muted" />
        )}
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{progress}%</span>
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
