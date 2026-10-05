import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
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
  deleteKeyResult,
  deleteObjective,
  getPlanner,
  lockObjectives,
  saveKeyResult,
  saveObjective,
  linkTaskToProject,
  setProjectKeyResult,
  type PlannerBoard,
  type PlannerObjective,
  type PlannerStatus,
  type PlannerTaskRow,
  type WorkspaceColleague,
  type WorkspaceProjectListItem,
} from '@/modules/workspace/workspaceApi';

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

type Filter = { due: string; status: string; priority: string; person: string; next: string; parent: string };

const EMPTY_FILTER: Filter = { due: 'any', status: 'any', priority: 'any', person: 'any', next: 'any', parent: 'any' };

function thisWeek(iso: string | null) {
  if (!iso) return false;
  const date = new Date(`${iso}T12:00:00`);
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return date >= monday && date <= sunday;
}

function dueText(iso: string | null) {
  if (!iso) return 'No date';
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isToday(iso: string | null) {
  if (!iso) return false;
  const date = new Date(`${iso}T12:00:00`);
  const today = dayStart(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return date >= today && date < tomorrow;
}

function isOverdue(iso: string | null, status: string) {
  if (!iso || status === 'done' || status === 'cancelled') return false;
  return new Date(`${iso}T12:00:00`) < dayStart(new Date());
}

function matches(
  row: { due_date: string | null; status: string; priority: string; person?: string; next_action?: string | null; links?: string[] },
  filter: Filter,
) {
  if (filter.due === 'today' && !isToday(row.due_date)) return false;
  if (filter.due === 'week' && !thisWeek(row.due_date)) return false;
  if (filter.due === 'overdue' && !isOverdue(row.due_date, row.status)) return false;
  if (filter.due === 'open' && (row.status === 'done' || row.status === 'cancelled')) return false;
  if (filter.status !== 'any' && row.status !== filter.status) return false;
  if (filter.priority !== 'any' && row.priority !== filter.priority) return false;
  if (filter.person !== 'any' && row.person !== filter.person) return false;
  if (filter.next === 'set' && !row.next_action?.trim()) return false;
  if (filter.parent !== 'any' && !(row.links ?? []).includes(filter.parent)) return false;
  return true;
}

function Section({
  title,
  count,
  open,
  onToggle,
  action,
  filter,
  onFilter,
  people,
  parents,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  filter: Filter;
  onFilter: (next: Filter) => void;
  people: string[];
  parents?: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card !p-0">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
          <span className="font-display text-lg font-medium tracking-tight">{title}</span>
          <span className="text-xs text-muted-foreground">{count}</span>
        </button>
        {action}
      </div>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="Due" value={filter.due} onChange={(due) => onFilter({ ...filter, due })} options={[['any', 'Any date'], ['today', 'Due today'], ['week', 'Due this week'], ['overdue', 'Overdue'], ['open', 'Still open']]} />
            <FilterSelect label="Status" value={filter.status} onChange={(status) => onFilter({ ...filter, status })} options={[['any', 'Any status'], ...Object.entries(STATUS_LABEL)]} />
            <FilterSelect label="Priority" value={filter.priority} onChange={(priority) => onFilter({ ...filter, priority })} options={[['any', 'Any priority'], ...Object.entries(PRIORITY_LABEL)]} />
            {people.length > 0 && (
              <FilterSelect label="Person" value={filter.person} onChange={(person) => onFilter({ ...filter, person })} options={[['any', 'Anyone'], ...people.map((name) => [name, name] as [string, string])]} />
            )}
            <FilterSelect label="Next action" value={filter.next} onChange={(next) => onFilter({ ...filter, next })} options={[['any', 'Any'], ['set', 'Has a next action']]} />
            {parents && parents.length > 0 && (
              <FilterSelect label="Linked to" value={filter.parent} onChange={(parent) => onFilter({ ...filter, parent })} options={[['any', 'Any link'], ...parents.map((name) => [name, name] as [string, string])]} />
            )}
            {(filter.due !== 'any' || filter.status !== 'any' || filter.priority !== 'any' || filter.person !== 'any' || filter.next !== 'any' || filter.parent !== 'any') && (
              <Button variant="ghost" size="sm" onClick={() => onFilter(EMPTY_FILTER)}>Clear</Button>
            )}
          </div>
          {children}
        </div>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[150px] text-xs">
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([id, text]) => (
          <SelectItem key={id} value={id}>{text}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProgressMark({ value }: { value: number }) {
  return <span className="display-number text-sm">{value}%</span>;
}

export default function PlannerLadder({
  projects,
  directory,
  onOpenProject,
}: {
  projects: WorkspaceProjectListItem[];
  directory: WorkspaceColleague[];
  onOpenProject: (id: string) => void;
}) {
  const [board, setBoard] = useState<PlannerBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({
    company: true,
    unit: false,
    kr: true,
    projects: true,
    tasks: false,
  });
  const [filters, setFilters] = useState<Record<string, Filter>>({
    company: { ...EMPTY_FILTER },
    unit: { ...EMPTY_FILTER },
    kr: { ...EMPTY_FILTER },
    projects: { ...EMPTY_FILTER },
    tasks: { ...EMPTY_FILTER },
  });
  const [editor, setEditor] = useState<null | { kind: 'company' | 'unit' | 'kr' }>(null);
  const [draft, setDraft] = useState({ title: '', parentId: '', priority: 'medium', status: 'not_started', due: '', ownerId: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setBoard(await getPlanner());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load the planner');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const people = useMemo(() => {
    const names = new Set<string>();
    board?.key_results.forEach((row) => names.add(row.owner_name));
    board?.tasks.forEach((row) => names.add(row.assignee_name));
    projects.forEach((row) => { if (row.owner_name) names.add(row.owner_name); });
    return [...names].sort();
  }, [board, projects]);

  const save = async () => {
    if (!draft.title.trim() || !editor) return;
    setSaving(true);
    try {
      if (editor.kind === 'kr') {
        const unit = board?.unit_objectives.find((row) => row.id === draft.parentId);
        await saveKeyResult({
          title: draft.title.trim(),
          unitObjectiveId: unit ? unit.id : null,
          companyObjectiveId: unit ? null : draft.parentId || null,
          priority: draft.priority,
          status: draft.status,
          dueDate: draft.due || null,
          ownerId: draft.ownerId || null,
        });
      } else {
        await saveObjective({
          level: editor.kind,
          parentId: editor.kind === 'unit' ? draft.parentId : null,
          title: draft.title.trim(),
          priority: draft.priority,
          status: draft.status,
          dueDate: draft.due || null,
        });
      }
      setEditor(null);
      await load();
      toast.success('Saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!board) return null;

  const companyRows = board.company_objectives.filter((row) => matches(row, filters.company));
  const unitRows = board.unit_objectives.filter((row) => matches({ ...row, links: row.parent_title ? [row.parent_title] : [] }, filters.unit));
  const krRows = board.key_results.filter((row) => matches({ ...row, person: row.owner_name, links: row.parent_title ? [row.parent_title] : [] }, filters.kr));
  const projectRows = projects.filter((row) => matches({
    due_date: row.due_date,
    status: (row.progress_pct ?? 0) >= 100 ? 'done' : (row.progress_pct ?? 0) > 0 ? 'in_progress' : 'not_started',
    priority: 'medium',
    person: row.owner_name ?? '',
  }, filters.projects));
  const taskRows = board.tasks.filter((row) => matches({
    ...row,
    person: row.assignee_name,
    links: [row.project_name, row.key_result_title, ...(row.also_on ?? [])].filter((name): name is string => Boolean(name)),
  }, filters.tasks));
  const taskLinks = [...new Set(board.tasks.flatMap((row) => [row.project_name, row.key_result_title, ...(row.also_on ?? [])].filter((name): name is string => Boolean(name))))].sort();
  const canEditObjectives = board.can_manage_objectives && (!board.objectives_locked || board.is_leadership);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {board.period}. Completion rolls up from tasks to projects, key results, and objectives. Critical work counts more than low-priority work. A key result can sit on a unit objective, or directly on a company objective. A task can also count on a second project.
        </p>
        {board.is_leadership && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void lockObjectives(!board.objectives_locked).then(load).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not update the lock'))}
          >
            <Lock className="h-3.5 w-3.5" />
            {board.objectives_locked ? 'Unlock quarter' : 'Lock quarter'}
          </Button>
        )}
      </div>

      <Section
        title="Company objectives"
        count={companyRows.length}
        open={open.company}
        onToggle={() => setOpen((prev) => ({ ...prev, company: !prev.company }))}
        filter={filters.company}
        onFilter={(next) => setFilters((prev) => ({ ...prev, company: next }))}
        people={[]}
        action={board.is_leadership && canEditObjectives ? (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => { setDraft({ title: '', parentId: '', priority: 'high', status: 'not_started', due: '', ownerId: '' }); setEditor({ kind: 'company' }); }}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        ) : undefined}
      >
        <ObjectiveTable
          rows={companyRows}
          childLabel="Unit objectives"
          onDelete={board.can_manage_objectives ? async (id) => { await deleteObjective(id); await load(); } : undefined}
        />
      </Section>

      <Section
        title="Unit objectives"
        count={unitRows.length}
        open={open.unit}
        onToggle={() => setOpen((prev) => ({ ...prev, unit: !prev.unit }))}
        filter={filters.unit}
        onFilter={(next) => setFilters((prev) => ({ ...prev, unit: next }))}
        people={[]}
        action={canEditObjectives ? (
          <Button size="sm" variant="outline" className="gap-1" disabled={board.company_objectives.length === 0} onClick={() => { setDraft({ title: '', parentId: board.company_objectives[0]?.id ?? '', priority: 'medium', status: 'not_started', due: '', ownerId: '' }); setEditor({ kind: 'unit' }); }}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        ) : undefined}
      >
        <ObjectiveTable
          rows={unitRows}
          childLabel="Key results"
          parent
          onDelete={board.can_manage_objectives ? async (id) => { await deleteObjective(id); await load(); } : undefined}
        />
      </Section>

      <Section
        title="Personal key results"
        count={krRows.length}
        open={open.kr}
        onToggle={() => setOpen((prev) => ({ ...prev, kr: !prev.kr }))}
        filter={filters.kr}
        onFilter={(next) => setFilters((prev) => ({ ...prev, kr: next }))}
        people={people}
        action={(
          <Button size="sm" variant="outline" className="gap-1" disabled={board.company_objectives.length === 0} onClick={() => { setDraft({ title: '', parentId: board.unit_objectives[0]?.id ?? board.company_objectives[0]?.id ?? '', priority: 'medium', status: 'not_started', due: '', ownerId: '' }); setEditor({ kind: 'kr' }); }}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">OKR</th>
                <th className="py-2 pr-3 font-medium">Priority</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Due</th>
                <th className="py-2 pr-3 font-medium">Projects</th>
                <th className="py-2 pr-3 font-medium">Tasks</th>
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="py-2 font-medium">Completion</th>
              </tr>
            </thead>
            <tbody>
              {krRows.map((row) => (
                <tr key={row.id} className="border-t border-border/70">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.parent_title}</p>
                  </td>
                  <td className="py-2.5 pr-3">{PRIORITY_LABEL[row.priority]}</td>
                  <td className="py-2.5 pr-3">{STATUS_LABEL[row.status]}</td>
                  <td className="py-2.5 pr-3">{dueText(row.due_date)}</td>
                  <td className="py-2.5 pr-3">{row.project_count}</td>
                  <td className="py-2.5 pr-3">{row.task_count}</td>
                  <td className="py-2.5 pr-3">{row.owner_name}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <ProgressMark value={row.progress_pct} />
                      {row.can_edit && (
                        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void deleteKeyResult(row.id).then(load).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not remove'))}>Remove</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {krRows.length === 0 && <EmptyRow span={8} text="No key results in this view. Add one under a company objective, or under a unit objective when the unit has one." />}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Projects"
        count={projectRows.length}
        open={open.projects}
        onToggle={() => setOpen((prev) => ({ ...prev, projects: !prev.projects }))}
        filter={filters.projects}
        onFilter={(next) => setFilters((prev) => ({ ...prev, projects: next }))}
        people={people}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Project</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Due</th>
                <th className="py-2 pr-3 font-medium">Tasks</th>
                <th className="py-2 pr-3 font-medium">OKR</th>
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="py-2 font-medium">Completion</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.map((row) => (
                <tr key={row.id} className="border-t border-border/70">
                  <td className="py-2.5 pr-3">
                    <button type="button" className="font-medium text-primary" onClick={() => onOpenProject(row.id)}>{row.name}</button>
                  </td>
                  <td className="py-2.5 pr-3">{(row.progress_pct ?? 0) >= 100 ? 'Done' : (row.progress_pct ?? 0) > 0 ? 'In progress' : 'Not started'}</td>
                  <td className="py-2.5 pr-3">{dueText(row.due_date)}</td>
                  <td className="py-2.5 pr-3">{row.task_count ?? 0}</td>
                  <td className="py-2.5 pr-3">
                    {row.can_edit ? (
                      <Select
                        value={board.project_links.find((link) => link.id === row.id)?.key_result_id ?? 'none'}
                        onValueChange={(value) => void setProjectKeyResult(row.id, value === 'none' ? null : value).then(load).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not link'))}
                      >
                        <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="No key result" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No key result</SelectItem>
                          {board.key_results.map((kr) => <SelectItem key={kr.id} value={kr.id}>{kr.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 pr-3">{row.owner_name ?? '—'}</td>
                  <td className="py-2.5"><ProgressMark value={row.progress_pct ?? 0} /></td>
                </tr>
              ))}
              {projectRows.length === 0 && <EmptyRow span={7} text="No projects in this view." />}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Tasks"
        count={taskRows.length}
        open={open.tasks}
        onToggle={() => setOpen((prev) => ({ ...prev, tasks: !prev.tasks }))}
        filter={filters.tasks}
        onFilter={(next) => setFilters((prev) => ({ ...prev, tasks: next }))}
        people={people}
        parents={taskLinks}
      >
        <TaskTable
          rows={taskRows}
          projects={projects}
          onOpenProject={onOpenProject}
          onLink={async (taskId, projectId) => {
            await linkTaskToProject(taskId, projectId);
            await load();
          }}
        />
      </Section>

      <Dialog open={editor !== null} onOpenChange={(next) => { if (!next) setEditor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.kind === 'company' ? 'Company objective' : editor?.kind === 'unit' ? 'Unit objective' : 'Personal key result'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />
            {editor?.kind === 'unit' && (
              <Select value={draft.parentId} onValueChange={(parentId) => setDraft((prev) => ({ ...prev, parentId }))}>
                <SelectTrigger><SelectValue placeholder="Company objective" /></SelectTrigger>
                <SelectContent>
                  {board.company_objectives.map((row) => <SelectItem key={row.id} value={row.id}>{row.title}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {editor?.kind === 'kr' && (
              <Select value={draft.parentId} onValueChange={(parentId) => setDraft((prev) => ({ ...prev, parentId }))}>
                <SelectTrigger><SelectValue placeholder="Feeds into" /></SelectTrigger>
                <SelectContent>
                  {board.unit_objectives.map((row) => <SelectItem key={row.id} value={row.id}>Unit · {row.title}</SelectItem>)}
                  {board.company_objectives.map((row) => <SelectItem key={row.id} value={row.id}>Company · {row.title}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {editor?.kind === 'kr' && directory.length > 0 && (
              <Select value={draft.ownerId || 'me'} onValueChange={(ownerId) => setDraft((prev) => ({ ...prev, ownerId: ownerId === 'me' ? '' : ownerId }))}>
                <SelectTrigger><SelectValue placeholder="Person" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Me</SelectItem>
                  {directory.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Select value={draft.priority} onValueChange={(priority) => setDraft((prev) => ({ ...prev, priority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABEL).map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={draft.status} onValueChange={(status) => setDraft((prev) => ({ ...prev, status }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['not_started', 'in_progress', 'done', 'blocked'] as PlannerStatus[]).map((id) => <SelectItem key={id} value={id}>{STATUS_LABEL[id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input type="date" value={draft.due} onChange={(event) => setDraft((prev) => ({ ...prev, due: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
            <Button disabled={saving || !draft.title.trim()} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ObjectiveTable({
  rows,
  childLabel,
  parent,
  onDelete,
}: {
  rows: PlannerObjective[];
  childLabel: string;
  parent?: boolean;
  onDelete?: (id: string) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">Objective</th>
            <th className="py-2 pr-3 font-medium">Priority</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Due</th>
            <th className="py-2 pr-3 font-medium">{childLabel}</th>
            <th className="py-2 font-medium">Completion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border/70">
              <td className="py-2.5 pr-3">
                <p className="font-medium">{row.title}</p>
                {parent && row.parent_title && <p className="text-xs text-muted-foreground">{row.parent_title}</p>}
              </td>
              <td className="py-2.5 pr-3">{PRIORITY_LABEL[row.priority]}</td>
              <td className="py-2.5 pr-3">{STATUS_LABEL[row.status]}</td>
              <td className="py-2.5 pr-3">{dueText(row.due_date)}</td>
              <td className="py-2.5 pr-3">{row.child_count}</td>
              <td className="py-2.5">
                <div className="flex items-center gap-2">
                  <ProgressMark value={row.progress_pct} />
                  {onDelete && (
                    <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void onDelete(row.id).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not remove'))}>Remove</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyRow span={6} text="Nothing in this view." />}
        </tbody>
      </table>
    </div>
  );
}

function TaskTable({
  rows,
  projects,
  onOpenProject,
  onLink,
}: {
  rows: PlannerTaskRow[];
  projects: WorkspaceProjectListItem[];
  onOpenProject: (id: string) => void;
  onLink: (taskId: string, projectId: string) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">Task</th>
            <th className="py-2 pr-3 font-medium">Priority</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Due</th>
            <th className="py-2 pr-3 font-medium">Project</th>
            <th className="py-2 pr-3 font-medium">OKR</th>
            <th className="py-2 pr-3 font-medium">Person</th>
            <th className="py-2 font-medium">Next action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border/70">
              <td className="py-2.5 pr-3 font-medium">{row.title}</td>
              <td className="py-2.5 pr-3">{PRIORITY_LABEL[row.priority] ?? row.priority}</td>
              <td className="py-2.5 pr-3">{STATUS_LABEL[row.status] ?? row.status}</td>
              <td className="py-2.5 pr-3">{dueText(row.due_date)}</td>
              <td className="py-2.5 pr-3">
                <button type="button" className="text-primary" onClick={() => onOpenProject(row.project_id)}>{row.project_name}</button>
                {row.also_on.length > 0 && <p className="text-xs text-muted-foreground">Also on {row.also_on.join(', ')}</p>}
                {projects.some((project) => project.id !== row.project_id) && (
                  <Select onValueChange={(projectId) => void onLink(row.id, projectId).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not add this task'))}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Add to another project" /></SelectTrigger>
                    <SelectContent>
                      {projects.filter((project) => project.id !== row.project_id && !row.also_on.includes(project.name)).map((project) => (
                        <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </td>
              <td className="py-2.5 pr-3">{row.key_result_title ?? '—'}</td>
              <td className="py-2.5 pr-3">{row.assignee_name}</td>
              <td className="py-2.5">{row.next_action ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyRow span={8} text="No tasks in this view." />}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRow({ span, text }: { span: number; text: string }) {
  return (
    <tr>
      <td colSpan={span} className="py-6 text-sm text-muted-foreground">{text}</td>
    </tr>
  );
}
