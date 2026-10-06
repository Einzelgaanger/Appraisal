import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, ClipboardList, Loader2, Plus, TreePalm, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { companyDirectory, type WorkspaceColleague } from '@/modules/workspace/workspaceApi';
import {
  cancelLeave,
  decideLeave,
  placeLeave,
  isActiveLeave,
  listLeave,
  myLeaveBalance,
  requestLeave,
  workingDays,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from './leaveApi';

const TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'Annual leave',
  compassionate: 'Compassionate leave',
  maternity: 'Maternity leave',
  study: 'Study leave',
  sick: 'Sick leave',
  unpaid: 'Unpaid leave',
  parental: 'Parental leave',
  other: 'Other',
};

const FORM_TYPES: LeaveType[] = ['annual', 'sick', 'compassionate', 'maternity', 'parental', 'study', 'unpaid', 'other'];

const TYPE_CHIP: Record<LeaveType, string> = {
  annual: 'bg-teal-100 text-teal-800',
  compassionate: 'bg-rose-100 text-rose-800',
  maternity: 'bg-fuchsia-100 text-fuchsia-800',
  study: 'bg-violet-100 text-violet-800',
  sick: 'bg-amber-100 text-amber-800',
  unpaid: 'bg-slate-200 text-slate-700',
  parental: 'bg-sky-100 text-sky-800',
  other: 'bg-orange-100 text-orange-800',
};

const softButton =
  'h-10 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal';

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function deptKey(value: string | null | undefined) {
  return (value || 'Unassigned').trim().toLowerCase();
}

function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function overlapsDay(row: LeaveRequest, day: string) {
  return isActiveLeave(row.status) && row.start_date <= day && row.end_date >= day;
}

type EnrichedLeave = LeaveRequest & {
  availableBefore: number;
  selectedDays: number;
  balanceAfter: number;
  usedFullQuarter: boolean;
};

function enrichLeave(rows: LeaveRequest[], allowance: number): EnrichedLeave[] {
  const groups = new Map<string, LeaveRequest[]>();
  for (const row of rows) {
    const list = groups.get(row.employee_id) ?? [];
    list.push(row);
    groups.set(row.employee_id, list);
  }
  const stats = new Map<string, { availableBefore: number; balanceAfter: number }>();
  for (const list of groups.values()) {
    const ordered = list
      .filter((row) => row.status !== 'cancelled')
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.start_date.localeCompare(b.start_date));
    let used = 0;
    for (const row of ordered) {
      const days = row.day_count || workingDays(row.start_date, row.end_date);
      const availableBefore = Math.max(0, allowance - used);
      if (row.status !== 'declined') used += days;
      stats.set(row.id, { availableBefore, balanceAfter: Math.max(0, allowance - used) });
    }
  }
  return rows.map((row) => {
    const days = row.day_count || workingDays(row.start_date, row.end_date);
    const found = stats.get(row.id) ?? { availableBefore: allowance, balanceAfter: allowance };
    return {
      ...row,
      selectedDays: days,
      availableBefore: found.availableBefore,
      balanceAfter: found.balanceAfter,
      usedFullQuarter: found.balanceAfter <= 0 && row.status !== 'declined' && row.status !== 'cancelled',
    };
  });
}

function approvalWord(status: LeaveStatus) {
  if (status === 'declined') return 'Denied';
  if (status === 'pending') return 'Pending';
  return 'Approved';
}

function lifeWord(row: LeaveRequest) {
  const today = iso(new Date());
  if (row.status === 'declined') return 'Denied';
  if (row.status === 'pending' || row.status === 'manager_approved') return 'Pending';
  if (row.end_date < today) return 'Completed';
  if (row.start_date <= today) return 'In progress';
  return 'Booked';
}

function lifeClass(label: string) {
  if (label === 'Completed' || label === 'Approved') return 'bg-emerald-100 text-emerald-800';
  if (label === 'Denied') return 'bg-rose-100 text-rose-800';
  if (label === 'In progress') return 'bg-sky-100 text-sky-800';
  if (label === 'Booked') return 'bg-teal-100 text-teal-800';
  return 'bg-amber-100 text-amber-900';
}

function formatStamp(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function monthCells(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const pad = start.getDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < pad; i += 1) cells.push(null);
  for (let d = 1; d <= end.getDate(); d += 1) {
    cells.push(iso(new Date(month.getFullYear(), month.getMonth(), d)));
  }
  return cells;
}

type Props = {
  employeeId: string | null;
};

export default function LeavePlanner({ employeeId }: Props) {
  const { isCompanyAdmin, isPlatformAdmin, profile } = useEmployeeAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [page, setPage] = useState<'form' | 'all' | 'calendar' | 'approved' | 'team'>('all');
  const [fullQuarter, setFullQuarter] = useState<'yes' | 'no' | ''>('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [forEmployeeId, setForEmployeeId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [people, setPeople] = useState<WorkspaceColleague[]>([]);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(() => new Date());

  const isHr = Boolean(balance?.is_hr) || isCompanyAdmin || isPlatformAdmin;
  const subjectId = forEmployeeId || employeeId;
  const placingForOther = Boolean(isHr && subjectId && subjectId !== employeeId);
  const requestedDays = workingDays(startDate, endDate);

  useEffect(() => {
    if (!isHr) return;
    companyDirectory().then(setPeople).catch(() => setPeople([]));
  }, [isHr]);

  const load = useCallback(async () => {
    const [data, nextBalance] = await Promise.all([listLeave(), myLeaveBalance()]);
    setRows(data);
    setBalance(nextBalance);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, nextBalance] = await Promise.all([listLeave(), myLeaveBalance()]);
        if (!cancelled) {
          setRows(data);
          setBalance(nextBalance);
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not load leave');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dateConflict = useMemo(() => {
    if (!startDate || !endDate || requestedDays <= 0) return null;
    const subject = people.find((person) => person.id === subjectId);
    const department = deptKey(subject?.department ?? (subjectId === employeeId ? balance?.department : null));
    return (
      rows.find(
        (row) =>
          row.id !== editingId &&
          isActiveLeave(row.status) &&
          row.start_date <= endDate &&
          row.end_date >= startDate &&
          (row.employee_id === subjectId || deptKey(row.department) === department),
      ) ?? null
    );
  }, [balance?.department, editingId, endDate, people, requestedDays, rows, startDate, subjectId]);

  const outsideWindow =
    Boolean(startDate && balance?.allowed_start && startDate < balance.allowed_start) ||
    Boolean(endDate && balance?.allowed_end && endDate > balance.allowed_end);

  const resetForm = () => {
    setNote('');
    setStartDate('');
    setEndDate('');
    setLeaveType('annual');
    setForEmployeeId('');
    setEditingId(null);
    setFullQuarter('');
  };

  const openRequest = () => {
    setEditingId(null);
    setForEmployeeId('');
    setLeaveType('annual');
    setStartDate('');
    setEndDate('');
    setNote('');
    setPage('form');
  };

  const openMove = (row: LeaveRequest) => {
    setEditingId(row.id);
    setForEmployeeId(row.employee_id);
    setLeaveType(row.leave_type);
    setStartDate(row.start_date);
    setEndDate(row.end_date);
    setNote(row.note ?? '');
    setFullQuarter('');
    setPage('form');
  };

  const handleCreate = async () => {
    if (!startDate || !endDate) return;
    if (!editingId && !placingForOther && requestedDays > 0) {
      const left = Math.max(0, (balance?.remaining ?? 10) - requestedDays);
      if (left === 0 && fullQuarter !== 'yes') {
        toast.error('This block uses the rest of your 10 days. Answer yes, then submit.');
        return;
      }
      if (left > 0 && fullQuarter !== 'no') {
        toast.error('You still have days left this quarter. Answer no, then file another form for the rest.');
        return;
      }
    }
    setSaving(true);
    try {
      if (editingId || placingForOther) {
        if (!subjectId) throw new Error('Choose the person this leave is for.');
        await placeLeave({
          employeeId: subjectId,
          leaveType,
          startDate,
          endDate,
          note: note.trim() || undefined,
          requestId: editingId,
        });
        toast.success(editingId ? 'Leave moved' : 'Leave placed and approved');
      } else {
        await requestLeave({ leaveType, startDate, endDate, note: note.trim() || undefined });
        toast.success(
          balance?.manager_name
            ? `Submitted to ${balance.manager_name} for line-manager approval`
            : 'Submitted for HR review',
        );
      }
      resetForm();
      setPage('all');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not request leave');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelLeave(id);
      toast.success('Leave cancelled');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel');
    }
  };

  const handleDecide = async (id: string, approve: boolean) => {
    try {
      await decideLeave(id, approve);
      toast.success(approve ? 'Approved' : 'Declined');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update leave');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading leave…
      </div>
    );
  }

  const remaining = balance?.remaining ?? 10;
  const allowance = balance?.allowance ?? 10;
  const editingRow = rows.find((row) => row.id === editingId) ?? null;
  const selectedPerson = people.find((person) => person.id === subjectId) ?? null;
  const formName = editingRow?.employee_name
    || (placingForOther ? selectedPerson?.name : balance?.employee_name || profile?.name)
    || '';
  const formTeam = editingRow?.department
    || (placingForOther ? selectedPerson?.department : balance?.department)
    || 'Unassigned';
  const subjectUsed = rows
    .filter((row) => row.employee_id === subjectId && row.id !== editingId && isActiveLeave(row.status))
    .reduce((sum, row) => sum + (row.day_count || workingDays(row.start_date, row.end_date)), 0);
  const formRemaining = placingForOther || editingId ? Math.max(0, allowance - subjectUsed) : remaining;
  const remainingAfter = Math.max(0, formRemaining - requestedDays);
  const enriched = enrichLeave(rows, allowance);
  const shown = enriched.filter((row) => {
    if (page === 'approved') return row.status === 'approved';
    if (page === 'team' && teamFilter !== 'all') return (row.department || 'Unassigned') === teamFilter;
    return true;
  });
  const cells = monthCells(month);
  const today = iso(new Date());

  return (
    <div className="space-y-4">
      <div className="app-sticky-subnav -mx-4 space-y-3 bg-background/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap gap-2">
        {([
          ['form', 'Leave form', Plus],
          ['all', 'All submissions', ClipboardList],
          ['calendar', 'Calendar', CalendarRange],
          ['approved', 'Approved leave', TreePalm],
          ['team', 'By team', Users],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPage(key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-medium',
              page === key ? 'bg-teal-500 text-white shadow-sm' : 'bg-white text-foreground/80 ring-1 ring-black/5 hover:bg-teal-50',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-r from-teal-50 via-white to-amber-50 px-4 py-3 ring-1 ring-teal-100">
        <p className="text-sm text-foreground/80">
          <span className="font-display text-2xl font-semibold text-foreground">{formRemaining}</span>
          <span className="ml-2">of {allowance} working days left{balance?.period ? ` · ${balance.period}` : ''}</span>
        </p>
        <Button
          onClick={openRequest}
          className={cn(softButton, 'gap-2 bg-teal-500 text-white hover:bg-teal-600')}
          disabled={!balance?.submit_open && !isHr}
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>
      </div>

      {(page === 'calendar' || page === 'all' || page === 'approved' || page === 'team') && (
        <section className="rounded-3xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                {page === 'calendar' ? 'Calendar' : page === 'approved' ? 'Approved leave' : page === 'team' ? 'By team' : 'All leave submissions'}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {page === 'calendar'
                  ? 'Each block shows the person, the dates, the leave type, how many days, and their team.'
                  : page === 'approved'
                    ? 'Leave that has cleared both the line manager and HR.'
                    : 'Name, dates, whether the 10 days are used up, days available, days in this form, balance left, when it was sent, type, manager, both approvals, team, and where the leave stands.'}
              </p>
            </div>
            {page === 'team' && (
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="h-10 w-48 rounded-2xl">
                  <SelectValue placeholder="All teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {[...new Set(rows.map((row) => row.department || 'Unassigned'))].sort().map((team) => (
                    <SelectItem key={team} value={team}>{team}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {page === 'calendar' ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-lg font-semibold">
                  {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 text-foreground hover:bg-muted"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 text-foreground hover:bg-muted"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {FORM_TYPES.map((type) => (
                  <span key={type} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TYPE_CHIP[type])}>
                    {TYPE_LABEL[type]}
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto">
              <div className="mb-1 grid min-w-[980px] grid-cols-7 gap-1.5 text-[12px] font-medium text-muted-foreground">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="px-1 py-1">{d}</div>
                ))}
              </div>
              <div className="grid min-w-[980px] grid-cols-7 gap-1.5">
                {cells.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} />;
                  const peopleOut = rows.filter((row) => overlapsDay(row, day));
                  const isToday = day === today;
                  return (
                    <div
                      key={day}
                      className={cn(
                        'min-h-[88px] rounded-2xl p-1.5',
                        isToday ? 'bg-teal-50 ring-1 ring-teal-300' : 'bg-muted/30',
                      )}
                    >
                      <p className={cn('text-xs font-semibold', isToday ? 'text-teal-800' : 'text-foreground/80')}>
                        {Number(day.slice(-2))}
                      </p>
                      <div className="mt-1 space-y-1">
                        {peopleOut.map((row) => (
                          row.start_date === day ? (
                            <div key={row.id} className="rounded-lg bg-white p-1.5 text-left shadow-sm ring-1 ring-black/5">
                              <p className="truncate text-[11px] font-semibold leading-tight">{row.employee_name}</p>
                              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                                {formatDate(row.start_date)} – {formatDate(row.end_date)}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-0.5">
                                <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium', lifeClass(approvalWord(row.status)))}>
                                  {approvalWord(row.status)}
                                </span>
                                <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium', TYPE_CHIP[row.leave_type] || TYPE_CHIP.other)}>
                                  {TYPE_LABEL[row.leave_type] || row.leave_type}
                                </span>
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium">{row.day_count || workingDays(row.start_date, row.end_date)}</span>
                                {row.department ? (
                                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-800">{row.department}</span>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <p
                              key={row.id}
                              className={cn(
                                'truncate rounded-md px-1 py-0.5 text-[10px] font-medium leading-tight',
                                TYPE_CHIP[row.leave_type] || TYPE_CHIP.other,
                              )}
                            >
                              {row.employee_name.split(' ')[0]}
                            </p>
                          )
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </>
          ) : shown.length === 0 ? (
            <p className="py-10 text-sm text-muted-foreground">
              {page === 'approved' ? 'No approved leave yet.' : page === 'team' ? 'No leave for this team.' : 'No submissions yet.'}
            </p>
          ) : (
            <LeaveTable
              rows={shown}
              employeeId={employeeId}
              isHr={isHr}
              onCancel={handleCancel}
              onMove={openMove}
              onDecide={handleDecide}
            />
          )}
        </section>
      )}

      {page === 'form' && (
        <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-[22px] font-semibold">
            {editingId ? 'Move leave' : placingForOther ? 'Place leave' : 'Leave planner'}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Each person has 10 working days in the quarter. Take them as one block, or split them and fill this form once for each block.
            You cannot choose the first two weeks or the last two weeks of the quarter. Every leave day has to be approved by your line manager before it takes effect,
            and the days must be in before the end of week 2. If the days are not selected in time, they are placed later, on dates that are still free, so people on the same team are not out together.
            Agree the dates with your line manager before you send the form.
          </p>
          <div className="mt-5 max-w-3xl space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Select your full name</Label>
                <Input value={formName} disabled readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Input value={formTeam} disabled readOnly />
              </div>
            </div>
            {isHr && (
              <div className="space-y-1.5">
                <Label>Person</Label>
                {editingId ? (
                  <Input value={rows.find((row) => row.id === editingId)?.employee_name || ''} disabled readOnly />
                ) : (
                  <Select value={forEmployeeId || 'me'} onValueChange={(value) => setForEmployeeId(value === 'me' ? '' : value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="me">Me</SelectItem>
                      {people.filter((person) => person.id !== employeeId).map((person) => (
                        <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Manager&apos;s name</Label>
              <Input value={balance?.manager_name || 'HR will review directly'} disabled readOnly />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Leave type</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {FORM_TYPES.map((value) => (
                  <label key={value} className="flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="leave-type"
                      checked={leaveType === value}
                      onChange={() => setLeaveType(value)}
                    />
                    {TYPE_LABEL[value]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Available number of leave days</Label>
                <Input value={String(formRemaining)} disabled readOnly />
                <p className="text-[12px] text-muted-foreground">Annual leave is not more than 10 working days a quarter. If you are filing again, this is what is still left.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Number of leave days selected in this form</Label>
                <Input value={requestedDays > 0 ? String(requestedDays) : ''} disabled readOnly placeholder="Choose dates first" />
              </div>
              <div className="space-y-1.5">
                <Label>Leave balance after this block</Label>
                <Input value={requestedDays > 0 ? String(remainingAfter) : ''} disabled readOnly />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leave-start">Choose your leave date range</Label>
                <Input
                  id="leave-start"
                  type="date"
                  min={balance?.allowed_start}
                  max={balance?.allowed_end}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leave-end">End date</Label>
                <Input
                  id="leave-end"
                  type="date"
                  min={balance?.allowed_start}
                  max={balance?.allowed_end}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">You can only select an aggregate of 10 working days in each quarter.</p>
            {!editingId && !placingForOther && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Have you selected up to 10 working days in this quarter?</legend>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  If this block uses the days you have left, answer yes and submit. You will hear when your line manager approves.
                  If days are still left, answer no and fill out another form for the rest.
                </p>
                <div className="flex gap-3">
                  {(['yes', 'no'] as const).map((value) => (
                    <label key={value} className="flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2 text-sm capitalize">
                      <input
                        type="radio"
                        name="full-quarter"
                        checked={fullQuarter === value}
                        onChange={() => setFullQuarter(value)}
                      />
                      {value === 'yes' ? 'Yes' : 'No'}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {!balance?.submit_open && !isHr && !editingId && (
              <p className="text-xs text-amber-800">
                The week-2 window closed on {formatDate(balance?.submit_deadline)}. HR can still place or move the days that are left.
              </p>
            )}
            {outsideWindow && (
              <p className="text-xs text-rose-700">
                Dates must sit between {formatDate(balance?.allowed_start)} and {formatDate(balance?.allowed_end)}.
              </p>
            )}
            {dateConflict && (
              <p className="text-xs text-rose-700">
                {dateConflict.employee_id === employeeId
                  ? `You already have leave booked ${formatDate(dateConflict.start_date)} – ${formatDate(dateConflict.end_date)}.`
                  : `${dateConflict.employee_name} in your department is already booked ${formatDate(dateConflict.start_date)} – ${formatDate(dateConflict.end_date)}.`}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="leave-reason">Note (optional)</Label>
              <Textarea
                id="leave-reason"
                placeholder="Anything your manager should know"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="ghost" className={softButton} onClick={() => { resetForm(); setPage('all'); }}>
              Back
            </Button>
            <Button
              className={cn(softButton, 'bg-teal-500 text-white hover:bg-teal-600')}
              onClick={handleCreate}
              disabled={
                saving ||
                !startDate ||
                !endDate ||
                requestedDays <= 0 ||
                (!editingId && !placingForOther && (requestedDays > formRemaining || !fullQuarter)) ||
                Boolean(dateConflict) ||
                outsideWindow ||
                (!editingId && !placingForOther && !isHr && balance?.submit_open === false)
              }
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function LeaveTable({
  rows,
  employeeId,
  isHr,
  onCancel,
  onMove,
  onDecide,
}: {
  rows: EnrichedLeave[];
  employeeId: string | null;
  isHr: boolean;
  onCancel: (id: string) => void;
  onMove: (row: LeaveRequest) => void;
  onDecide: (id: string, approve: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1280px] border-separate border-spacing-y-1 text-left text-[13px]">
        <thead>
          <tr className="text-[11px] font-medium text-muted-foreground">
            {[
              'Full name',
              'Leave dates',
              'Up to 10 days',
              'Days available',
              'Days in this form',
              'Leave balance',
              'Submitted',
              'Leave type',
              'Manager',
              'Approval',
              'HR',
              'Team',
              'Leave status',
              '',
            ].map((heading) => (
              <th key={heading || 'actions'} className="whitespace-nowrap px-2 py-2 font-medium">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mine = row.employee_id === employeeId;
            const canManager = row.status === 'pending' && row.manager_id === employeeId;
            const canHr = isHr && (row.status === 'manager_approved' || (row.status === 'pending' && !row.manager_id));
            const hrLabel = row.status === 'approved' ? 'Approved' : row.status === 'declined' ? 'Denied' : row.status === 'manager_approved' ? 'Waiting' : 'Not yet';
            return (
              <tr key={row.id} className="bg-muted/30">
                <td className="whitespace-nowrap rounded-l-xl px-2 py-2.5 font-medium">{row.employee_name}</td>
                <td className="whitespace-nowrap px-2 py-2.5">{formatDate(row.start_date)} – {formatDate(row.end_date)}</td>
                <td className="px-2 py-2.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', row.usedFullQuarter ? 'bg-amber-100 text-amber-900' : 'bg-white text-foreground/70 ring-1 ring-black/5')}>
                    {row.usedFullQuarter ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-2 py-2.5">{row.availableBefore}</td>
                <td className="px-2 py-2.5">{row.selectedDays}</td>
                <td className="px-2 py-2.5">{row.balanceAfter}</td>
                <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">{formatStamp(row.created_at)}</td>
                <td className="px-2 py-2.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TYPE_CHIP[row.leave_type] || TYPE_CHIP.other)}>
                    {TYPE_LABEL[row.leave_type] || row.leave_type}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-2.5">{row.manager_name || 'HR'}</td>
                <td className="px-2 py-2.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', lifeClass(approvalWord(row.status)))}>
                    {approvalWord(row.status)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-2.5">
                  {canHr ? (
                    <span className="flex gap-1">
                      <button type="button" className="rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white" onClick={() => onDecide(row.id, true)}>Approve</button>
                      <button type="button" className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-800" onClick={() => onDecide(row.id, false)}>Deny</button>
                    </span>
                  ) : (
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', lifeClass(hrLabel))}>{hrLabel}</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">{row.department || 'Unassigned'}</span>
                </td>
                <td className="px-2 py-2.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', lifeClass(lifeWord(row)))}>{lifeWord(row)}</span>
                </td>
                <td className="whitespace-nowrap rounded-r-xl px-2 py-2.5">
                  <span className="flex gap-1">
                    {canManager && (
                      <>
                        <button type="button" className="rounded-full bg-teal-500 px-2.5 py-1 text-[11px] font-medium text-white" onClick={() => onDecide(row.id, true)}>Approve</button>
                        <button type="button" className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-800" onClick={() => onDecide(row.id, false)}>Deny</button>
                      </>
                    )}
                    {mine && isActiveLeave(row.status) && (
                      <button type="button" className="rounded-full px-2.5 py-1 text-[11px] font-medium text-foreground/70 hover:bg-white" onClick={() => onCancel(row.id)}>Cancel</button>
                    )}
                    {isHr && isActiveLeave(row.status) && (
                      <button type="button" className="rounded-full px-2.5 py-1 text-[11px] font-medium text-foreground/70 hover:bg-white" onClick={() => onMove(row)}>Move</button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
