import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import {
  cancelLeave,
  decideLeave,
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

const FORM_TYPES: LeaveType[] = ['annual', 'compassionate', 'maternity', 'study'];

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function deptKey(value: string | null | undefined) {
  return (value || 'Unassigned').trim().toLowerCase();
}

function daysLabel(n: number) {
  return `${n} working day${n === 1 ? '' : 's'}`;
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

function leavePhase(row: LeaveRequest) {
  const today = iso(new Date());
  if (row.status === 'declined') return 'Declined';
  if (row.status === 'pending') return 'Waiting for manager';
  if (row.status === 'manager_approved') return 'Waiting for HR';
  if (row.end_date < today) return 'Completed';
  if (row.start_date <= today) return 'In progress';
  return 'Approved';
}

function statusClass(status: LeaveStatus) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (status === 'declined') return 'bg-rose-50 text-rose-800 border-rose-200';
  if (status === 'manager_approved') return 'bg-sky-50 text-sky-800 border-sky-200';
  return 'bg-amber-50 text-amber-800 border-amber-200';
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
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [month, setMonth] = useState(() => new Date());

  const isHr = Boolean(balance?.is_hr) || isCompanyAdmin || isPlatformAdmin;
  const requestedDays = workingDays(startDate, endDate);

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

  const managerQueue = useMemo(
    () => rows.filter((r) => r.status === 'pending' && r.manager_id === employeeId),
    [employeeId, rows],
  );
  const hrQueue = useMemo(
    () => rows.filter((r) => r.status === 'manager_approved' || (isHr && r.status === 'pending' && !r.manager_id)),
    [isHr, rows],
  );
  const upcoming = useMemo(() => {
    const today = iso(new Date());
    return rows.filter((r) => r.status === 'approved' && r.end_date >= today);
  }, [rows]);

  const dateConflict = useMemo(() => {
    if (!startDate || !endDate || requestedDays <= 0) return null;
    const mine = deptKey(balance?.department);
    return (
      rows.find(
        (row) =>
          isActiveLeave(row.status) &&
          row.start_date <= endDate &&
          row.end_date >= startDate &&
          (row.employee_id === employeeId || deptKey(row.department) === mine),
      ) ?? null
    );
  }, [balance?.department, employeeId, endDate, requestedDays, rows, startDate]);

  const outsideWindow =
    Boolean(startDate && balance?.allowed_start && startDate < balance.allowed_start) ||
    Boolean(endDate && balance?.allowed_end && endDate > balance.allowed_end);

  const handleCreate = async () => {
    if (!startDate || !endDate) return;
    setSaving(true);
    try {
      await requestLeave({ leaveType, startDate, endDate, note: note.trim() || undefined });
      toast.success(
        balance?.manager_name
          ? `Submitted to ${balance.manager_name} for line-manager approval`
          : 'Submitted for HR review',
      );
      setOpen(false);
      setNote('');
      setStartDate('');
      setEndDate('');
      setLeaveType('annual');
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
  const used = balance?.used ?? 0;
  const allowance = balance?.allowance ?? 10;
  const usedPct = Math.min(100, Math.round((used / allowance) * 100));
  const remainingAfter = Math.max(0, remaining - requestedDays);
  const cells = monthCells(month);
  const today = iso(new Date());

  return (
    <div className="space-y-4">
      <div className="surface-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <CalendarRange className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">◉ Leave planner</p>
            <h2 className="font-display text-2xl font-medium mt-1">Leave planner</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              Each person has <strong>10 working days</strong> this quarter. Take them in one block or split them — one
              form per block. Leave cannot fall in the first or last two weeks of the quarter, and requests must be in
              by the end of week 2. Your line manager approves first, then HR. Two people from the same department
              cannot be out on the same dates.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {upcoming.length} approved upcoming · {managerQueue.length} waiting for manager · {hrQueue.length} waiting
              for HR
            </p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0" disabled={!balance?.submit_open && !isHr}>
          <Plus className="h-4 w-4 mr-1" />
          Request leave
        </Button>
      </div>

      <div className="surface-card p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Your balance · {balance?.period}</p>
        <p className="mt-1 text-sm font-medium">
          {remaining} of {allowance} working days left
          {balance?.department ? ` · ${balance.department}` : ''}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Allowed dates {formatDate(balance?.allowed_start)} – {formatDate(balance?.allowed_end)}. Submit by{' '}
          {formatDate(balance?.submit_deadline)}.
          {balance?.manager_name ? ` Line manager: ${balance.manager_name}.` : ''}
          {!balance?.submit_open && !isHr
            ? ' The week-2 window is closed — remaining days are rescheduled by HR around department conflicts.'
            : ''}
        </p>
        <Progress value={usedPct} className="mt-3 h-2" />
      </div>

      {managerQueue.length > 0 && (
        <QueueCard
          title="Waiting for you (line manager)"
          rows={managerQueue}
          onDecide={handleDecide}
        />
      )}

      {isHr && hrQueue.length > 0 && (
        <QueueCard title="Waiting for HR" rows={hrQueue} onDecide={handleDecide} />
      )}

      <div className="flex gap-2">
        <Button variant={view === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setView('calendar')}>
          Calendar
        </Button>
        <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>
          All requests
        </Button>
      </div>

      {view === 'calendar' ? (
        <div className="surface-card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium">
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="px-1 py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const people = rows.filter((row) => overlapsDay(row, day));
              const isToday = day === today;
              return (
                <div
                  key={day}
                  className={`min-h-[72px] rounded-md border p-1.5 ${
                    isToday ? 'border-primary/50 bg-primary/5' : 'border-border/60'
                  }`}
                >
                  <p className="text-xs font-medium">{Number(day.slice(-2))}</p>
                  <div className="mt-1 space-y-0.5">
                    {people.slice(0, 3).map((row) => (
                      <p key={row.id} className="text-[10px] leading-tight truncate text-muted-foreground">
                        {row.employee_name.split(' ')[0]}
                        {row.status === 'pending' ? ' · mgr' : row.status === 'manager_approved' ? ' · HR' : ''}
                      </p>
                    ))}
                    {people.length > 3 ? (
                      <p className="text-[10px] text-muted-foreground">+{people.length - 3}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border/60">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Requests</p>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No leave on the calendar yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map((row) => {
                const mine = row.employee_id === employeeId;
                const canManager = row.status === 'pending' && row.manager_id === employeeId;
                const canHr = isHr && (row.status === 'manager_approved' || (row.status === 'pending' && !row.manager_id));
                return (
                  <li key={row.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {row.employee_name}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          · {TYPE_LABEL[row.leave_type] || row.leave_type}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(row.start_date)} – {formatDate(row.end_date)}
                        {' · '}
                        {daysLabel(row.day_count || workingDays(row.start_date, row.end_date))}
                        {row.department ? ` · ${row.department}` : ''}
                        {row.manager_name ? ` · Manager ${row.manager_name}` : ''}
                        {row.note ? ` · ${row.note}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusClass(row.status)}>
                        {leavePhase(row)}
                      </Badge>
                      {mine && isActiveLeave(row.status) && (
                        <Button variant="ghost" size="sm" onClick={() => handleCancel(row.id)}>
                          Cancel
                        </Button>
                      )}
                      {(canManager || canHr) && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleDecide(row.id, true)}>
                            Approve
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDecide(row.id, false)}>
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
            <DialogDescription>
              One block at a time. If this is not your full 10 working days, submit another form for the rest.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={balance?.employee_name || profile?.name || ''} disabled readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Input value={balance?.department || 'Unassigned'} disabled readOnly />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Line manager</Label>
              <Input value={balance?.manager_name || 'HR will review directly'} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-type">Leave type</Label>
              <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
                <SelectTrigger id="leave-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {TYPE_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Available this quarter: {daysLabel(remaining)}. Annual leave cannot exceed 10 working days.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leave-start">Start</Label>
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
                <Label htmlFor="leave-end">End</Label>
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
            {requestedDays > 0 && (
              <p className="text-xs text-muted-foreground">
                This block uses {daysLabel(requestedDays)}. After submit you will have {daysLabel(remainingAfter)} left
                {remainingAfter > 0 ? ' — file another block for the remainder.' : '.'}
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                saving ||
                !startDate ||
                !endDate ||
                requestedDays <= 0 ||
                requestedDays > remaining ||
                Boolean(dateConflict) ||
                outsideWindow
              }
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QueueCard({
  title,
  rows,
  onDecide,
}: {
  title: string;
  rows: LeaveRequest[];
  onDecide: (id: string, approve: boolean) => void;
}) {
  return (
    <div className="surface-card overflow-hidden border-amber-200/80">
      <div className="px-5 py-3 border-b border-border/60">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li key={row.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {row.employee_name}
                <span className="text-muted-foreground font-normal">
                  {' '}
                  · {TYPE_LABEL[row.leave_type] || row.leave_type} · {daysLabel(row.day_count || workingDays(row.start_date, row.end_date))}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(row.start_date)} – {formatDate(row.end_date)}
                {row.department ? ` · ${row.department}` : ''}
                {row.note ? ` · ${row.note}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => onDecide(row.id, true)}>
                Approve
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDecide(row.id, false)}>
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
