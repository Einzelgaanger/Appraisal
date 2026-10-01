import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  listLeave,
  requestLeave,
  type LeaveRequest,
  type LeaveType,
} from './leaveApi';

const TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'Annual',
  sick: 'Sick',
  unpaid: 'Unpaid',
  parental: 'Parental',
  compassionate: 'Compassionate',
  other: 'Other',
};

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function overlapsToday(row: LeaveRequest) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${row.start_date}T00:00:00`);
  const end = new Date(`${row.end_date}T00:00:00`);
  return row.status === 'approved' && start <= today && end >= today;
}

function statusClass(status: LeaveRequest['status']) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (status === 'declined') return 'bg-rose-50 text-rose-800 border-rose-200';
  return 'bg-amber-50 text-amber-800 border-amber-200';
}

type Props = {
  employeeId: string | null;
};

export default function LeavePlanner({ employeeId }: Props) {
  const { isCompanyAdmin } = useEmployeeAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await listLeave();
    setRows(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listLeave();
        if (!cancelled) setRows(data);
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

  const outToday = useMemo(() => rows.filter(overlapsToday), [rows]);
  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);
  const upcoming = useMemo(
    () =>
      rows.filter((r) => r.status === 'approved' && r.start_date >= new Date().toISOString().slice(0, 10)),
    [rows],
  );

  const handleCreate = async () => {
    if (!startDate || !endDate) return;
    setSaving(true);
    try {
      await requestLeave({ leaveType, startDate, endDate, note: note.trim() || undefined });
      toast.success('Leave requested');
      setOpen(false);
      setNote('');
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

  return (
    <div className="space-y-4">
      <div className="surface-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <CalendarRange className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">◉ Leave planner</p>
            <h2 className="font-display text-2xl font-medium mt-1">Who is out</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {outToday.length} out today · {pending.length} pending · {upcoming.length} upcoming
            </p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Request leave
        </Button>
      </div>

      {outToday.length > 0 && (
        <div className="surface-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">Out today</p>
          <div className="flex flex-wrap gap-2">
            {outToday.map((row) => (
              <Badge key={row.id} variant="secondary">
                {row.employee_name} · {TYPE_LABEL[row.leave_type]}
              </Badge>
            ))}
          </div>
        </div>
      )}

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
              return (
                <li key={row.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {row.employee_name}
                      <span className="text-muted-foreground font-normal"> · {TYPE_LABEL[row.leave_type]}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(row.start_date)} – {formatDate(row.end_date)}
                      {row.note ? ` · ${row.note}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusClass(row.status)}>
                      {row.status}
                    </Badge>
                    {mine && (row.status === 'pending' || row.status === 'approved') && (
                      <Button variant="ghost" size="sm" onClick={() => handleCancel(row.id)}>
                        Cancel
                      </Button>
                    )}
                    {isCompanyAdmin && row.status === 'pending' && (
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
            <DialogDescription>Visible to your company only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <Textarea
              placeholder="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button onClick={handleCreate} disabled={saving || !startDate || !endDate}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
