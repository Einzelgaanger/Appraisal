import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClipboardList, Loader2, TrendingUp, Users, LayoutDashboard, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  monthOptions,
  quarterOptions,
  resolveMonthPeriod,
  resolveQuarterPeriod,
} from '@/lib/boomPeriods';
import { ENABLE_APP_AI } from '@/lib/featureFlags';
import { ghcGetMyTasks, type GhcTaskRow } from './ghcApi';
import GhcMonthlyReviewRunner from './GhcMonthlyReviewRunner';
import Ghc360Runner from './Ghc360Runner';
import GhcQuarterlyEvaluationRunner from './GhcQuarterlyEvaluationRunner';
import GhcMyResults from './GhcMyResults';
import GhcDirectoryPanel from './GhcDirectoryPanel';
import GhcAcknowledgePanel from './GhcAcknowledgePanel';
import GhcAiAssistCard from './GhcAiAssistCard';
import GhcAdminMonitor from './GhcAdminMonitor';

function statusBadge(status: string) {
  if (status === 'submitted' || status === 'acknowledged') {
    return <Badge className="text-[10px] bg-emerald-600">Done</Badge>;
  }
  if (status === 'draft') return <Badge variant="secondary" className="text-[10px]">In progress</Badge>;
  return <Badge variant="outline" className="text-[10px]">To do</Badge>;
}

interface Props {
  employeeId: string | null;
  employeeName?: string | null;
  isPlatformAdmin?: boolean;
}

export default function GhcReviewHub({ employeeId, employeeName, isPlatformAdmin = false }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const periodQuarter = resolveQuarterPeriod(searchParams.get('ghcQuarter'));
  const periodMonth = resolveMonthPeriod(searchParams.get('ghcMonth'));
  const [tab, setTab] = useState(searchParams.get('ghcTab') || 'tasks');
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<GhcTaskRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runner, setRunner] = useState<GhcTaskRow | null>(null);

  const setPeriodQuarter = useCallback(
    (q: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('ghcQuarter', q);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const setPeriodMonth = useCallback(
    (m: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('ghcMonth', m);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await ghcGetMyTasks(periodMonth, periodQuarter);
      setTasks(rows);
    } catch (e) {
      console.error(e);
      const raw = e instanceof Error ? e.message : 'Could not load GHC tasks';
      const missingSchema =
        /ghc_get_my_tasks|Could not find the function|schema cache|does not exist/i.test(raw);
      const message = missingSchema
        ? 'GHC database migration is not applied yet. Apply 20260909180000_ghc_appraisal_system.sql, then refresh.'
        : raw;
      setLoadError(message);
      toast.error(missingSchema ? 'GHC database not ready' : message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId, periodMonth, periodQuarter]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, GhcTaskRow[]>();
    for (const t of tasks) {
      const list = map.get(t.kind) ?? [];
      list.push(t);
      map.set(t.kind, list);
    }
    return map;
  }, [tasks]);

  const openTask = (task: GhcTaskRow) => {
    if (task.kind === 'acknowledge_evaluation') {
      setTab('results');
      setRunner(task);
      return;
    }
    setRunner(task);
  };

  if (!employeeId) {
    return (
      <div className="glass-panel p-8 text-sm text-muted-foreground">
        Complete your profile and link to the GreenHouse Capital roster to see appraisal tasks.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">GreenHouse Capital</p>
          <h2 className="font-display text-2xl font-medium tracking-tight">Appraisal workspace</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Monthly manager reviews, quarterly 360, and formal evaluations — separate from the Executive Team BOOM flow.
            {employeeName ? ` Signed in as ${employeeName}.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={periodMonth} onValueChange={setPeriodMonth}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              {monthOptions().map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={periodQuarter} onValueChange={setPeriodQuarter}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Quarter" /></SelectTrigger>
            <SelectContent>
              {quarterOptions().map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-9" onClick={() => void load()}>Refresh</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/50 p-1">
          <TabsTrigger value="tasks" className="text-xs gap-1"><ClipboardList className="w-3 h-3" /> Tasks</TabsTrigger>
          <TabsTrigger value="results" className="text-xs gap-1"><TrendingUp className="w-3 h-3" /> My results</TabsTrigger>
          <TabsTrigger value="directory" className="text-xs gap-1"><Users className="w-3 h-3" /> Directory</TabsTrigger>
          {ENABLE_APP_AI && (
            <TabsTrigger value="assist" className="text-xs gap-1"><Sparkles className="w-3 h-3" /> AI assist</TabsTrigger>
          )}
          {isPlatformAdmin && (
            <TabsTrigger value="admin" className="text-xs gap-1"><LayoutDashboard className="w-3 h-3" /> Monitor</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="tasks" className="mt-0 space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive space-y-2">
              <p className="font-medium">Could not load GHC tasks</p>
              <p className="text-destructive/90 leading-relaxed">{loadError}</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground space-y-1">
              <p>No open GHC tasks for {periodMonth} / {periodQuarter}.</p>
              <p className="text-xs">
                Managers should see monthly + quarterly evaluation rows for their reports; everyone should see peer 360s for the rest of the active roster.
              </p>
            </div>
          ) : (
            <>
              {(['monthly_manager', 'peer_360', 'quarterly_evaluation', 'acknowledge_evaluation'] as const).map((kind) => {
                const list = grouped.get(kind);
                if (!list?.length) return null;
                const title =
                  kind === 'monthly_manager' ? 'Monthly manager reviews'
                    : kind === 'peer_360' ? 'Quarterly 360 feedback'
                      : kind === 'quarterly_evaluation' ? 'Quarterly evaluations'
                        : 'Acknowledgements';
                return (
                  <div key={kind} className="glass-panel p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <span className="text-[10px] text-muted-foreground">({list.length})</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                            <th className="pb-2 pr-3 font-medium">Person</th>
                            <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Role</th>
                            <th className="pb-2 pr-3 font-medium">Period</th>
                            <th className="pb-2 pr-3 font-medium">Status</th>
                            <th className="pb-2 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((row) => (
                            <tr key={`${row.kind}-${row.subject_id}-${row.period}`} className="border-b border-border/40 last:border-0">
                              <td className="py-2.5 pr-3 font-medium">{row.subject_name}</td>
                              <td className="py-2.5 pr-3 hidden sm:table-cell text-xs text-muted-foreground">{row.subject_role ?? '—'}</td>
                              <td className="py-2.5 pr-3 font-mono text-xs">{row.period}</td>
                              <td className="py-2.5 pr-3">{statusBadge(row.status)}</td>
                              <td className="py-2.5 text-right">
                                <Button size="sm" className="h-8 text-xs" variant={row.status === 'submitted' || row.status === 'acknowledged' ? 'outline' : 'default'} onClick={() => openTask(row)}>
                                  {row.status === 'todo' ? 'Start' : row.status === 'draft' ? 'Continue' : row.kind === 'acknowledge_evaluation' && row.status === 'submitted' ? 'Acknowledge' : 'Open'}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </TabsContent>

        <TabsContent value="results" className="mt-0">
          <GhcMyResults
            periodQuarter={periodQuarter}
            acknowledgeTask={runner?.kind === 'acknowledge_evaluation' ? runner : null}
            onAcknowledged={() => {
              setRunner(null);
              void load();
            }}
          />
        </TabsContent>

        <TabsContent value="directory" className="mt-0">
          <GhcDirectoryPanel periodQuarter={periodQuarter} periodMonth={periodMonth} />
        </TabsContent>

        {ENABLE_APP_AI && (
          <TabsContent value="assist" className="mt-0">
            <GhcAiAssistCard employeeName={employeeName} periodMonth={periodMonth} periodQuarter={periodQuarter} />
          </TabsContent>
        )}

        {isPlatformAdmin && (
          <TabsContent value="admin" className="mt-0">
            <GhcAdminMonitor periodQuarter={periodQuarter} periodMonth={periodMonth} />
          </TabsContent>
        )}
      </Tabs>

      {runner?.kind === 'monthly_manager' && (
        <GhcMonthlyReviewRunner
          open
          onOpenChange={(open) => { if (!open) setRunner(null); }}
          task={runner}
          managerEmployeeId={employeeId}
          onSaved={() => { setRunner(null); void load(); }}
        />
      )}
      {runner?.kind === 'peer_360' && (
        <Ghc360Runner
          open
          onOpenChange={(open) => { if (!open) setRunner(null); }}
          task={runner}
          onSaved={() => { setRunner(null); void load(); }}
        />
      )}
      {runner?.kind === 'quarterly_evaluation' && (
        <GhcQuarterlyEvaluationRunner
          open
          onOpenChange={(open) => { if (!open) setRunner(null); }}
          task={runner}
          managerEmployeeId={employeeId}
          onSaved={() => { setRunner(null); void load(); }}
        />
      )}
      {runner?.kind === 'acknowledge_evaluation' && tab === 'tasks' && (
        <GhcAcknowledgePanel
          task={runner}
          onDone={() => { setRunner(null); void load(); }}
        />
      )}
    </div>
  );
}

