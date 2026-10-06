import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClipboardPen, Loader2, MessageSquareText, NotebookPen, PartyPopper, Sparkles, TrendingUp, Users, LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';
import {
  monthOptions,
  quarterOptions,
  resolveMonthPeriod,
  resolveQuarterPeriod,
} from '@/lib/boomPeriods';
import { ENABLE_APP_AI } from '@/lib/featureFlags';
import { ghcGetDirectory, ghcGetMyTasks, type GhcTaskRow } from './ghcApi';
import { displayHierarchyLabel } from '@/lib/hierarchyConvention';
import { useTenant } from '@/tenants/TenantContext';
import GhcMonthlyReviewRunner from './GhcMonthlyReviewRunner';
import GhcMonthlySelfCheckinRunner from './GhcMonthlySelfCheckinRunner';
import Ghc360Runner from './Ghc360Runner';
import GhcQuarterlyEvaluationRunner from './GhcQuarterlyEvaluationRunner';
import GhcMyResults from './GhcMyResults';
import GhcDirectoryPanel from './GhcDirectoryPanel';
import GhcAcknowledgePanel from './GhcAcknowledgePanel';
import GhcAiAssistCard from './GhcAiAssistCard';
import GhcAdminMonitor from './GhcAdminMonitor';

const softButton = 'h-9 rounded-2xl font-sans text-sm font-medium normal-case tracking-normal';

const KIND_LOOK = {
  monthly_self: { title: 'Monthly self check-in', icon: NotebookPen, chip: 'bg-teal-100 text-teal-800' },
  monthly_manager: { title: 'Monthly manager reviews', icon: Users, chip: 'bg-amber-100 text-amber-900' },
  peer_360: { title: 'Quarterly 360 feedback', icon: MessageSquareText, chip: 'bg-violet-100 text-violet-800' },
  quarterly_evaluation: { title: 'Quarterly evaluations', icon: ClipboardPen, chip: 'bg-rose-100 text-rose-800' },
  acknowledge_evaluation: { title: 'Acknowledgements', icon: PartyPopper, chip: 'bg-sky-100 text-sky-800' },
} as const;

function statusBadge(status: string) {
  if (status === 'submitted' || status === 'acknowledged') {
    return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[12px] font-medium text-emerald-800">Done</span>;
  }
  if (status === 'draft') return <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[12px] font-medium text-sky-800">In progress</span>;
  return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-medium text-amber-900">To do</span>;
}

interface Props {
  employeeId: string | null;
  employeeName?: string | null;
  isPlatformAdmin?: boolean;
  isCompanyAdmin?: boolean;
}

export default function GhcReviewHub({
  employeeId,
  employeeName,
  isPlatformAdmin = false,
  isCompanyAdmin = false,
}: Props) {
  const canUseHrMonitor = isPlatformAdmin || isCompanyAdmin;
  const { tenant } = useTenant();
  // This hub is shared by every GHC-style tenant, so all copy names the active company.
  const org = tenant.branding.fullName;
  const [searchParams, setSearchParams] = useSearchParams();
  const periodQuarter = resolveQuarterPeriod(searchParams.get('ghcQuarter'));
  const periodMonth = resolveMonthPeriod(searchParams.get('ghcMonth'));
  const [tab, setTabState] = useState(searchParams.get('ghcTab') || 'tasks');

  const setTab = useCallback(
    (next: string) => {
      setTabState(next);
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set('ghcTab', next);
        if (!params.get('tenant')) params.set('tenant', tenant.slug);
        return params;
      }, { replace: true });
    },
    [setSearchParams, tenant.slug],
  );

  useEffect(() => {
    const fromUrl = searchParams.get('ghcTab');
    if (fromUrl && fromUrl !== tab) setTabState(fromUrl);
  }, [searchParams, tab]);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<GhcTaskRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runner, setRunner] = useState<GhcTaskRow | null>(null);
  const [levelById, setLevelById] = useState<Record<string, number>>({});

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
      const raw = e instanceof Error ? e.message : 'Could not load appraisal tasks';
      const missingSchema =
        /ghc_get_my_tasks|Could not find the function|schema cache|does not exist/i.test(raw);
      const message = missingSchema
        ? 'The appraisal database migration is not applied yet. Apply 20260909180000_ghc_appraisal_system.sql, then refresh.'
        : raw;
      setLoadError(message);
      toast.error(missingSchema ? 'Appraisal database not ready' : message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId, periodMonth, periodQuarter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void ghcGetDirectory(periodQuarter, periodMonth)
      .then((rows) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const r of rows as Array<{ id: string; hierarchy_level: number | null }>) {
          if (r.hierarchy_level != null) map[r.id] = r.hierarchy_level;
        }
        setLevelById(map);
      })
      .catch(() => {
        if (!cancelled) setLevelById({});
      });
    return () => { cancelled = true; };
  }, [periodQuarter, periodMonth]);

  const grouped = useMemo(() => {
    const map = new Map<string, GhcTaskRow[]>();
    for (const t of tasks) {
      const list = map.get(t.kind) ?? [];
      list.push(t);
      map.set(t.kind, list);
    }
    return map;
  }, [tasks]);

  const reportCount = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) {
      if (t.kind === 'monthly_manager' || t.kind === 'quarterly_evaluation') ids.add(t.subject_id);
    }
    return ids.size;
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
        Complete your profile and link to the {org} roster to see appraisal tasks.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid items-end gap-4 rounded-3xl bg-gradient-to-r from-teal-50 via-white to-amber-50 p-5 ring-1 ring-teal-100 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h2 className="font-display text-2xl font-semibold">Your appraisals</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Monthly reviews, quarterly 360s, and evaluations for {org}.
            {employeeName ? ` Signed in as ${employeeName}.` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-[13px] font-medium text-foreground/80 ring-1 ring-black/5">
              {reportCount > 0 ? `Managing ${reportCount} ${reportCount === 1 ? 'person' : 'people'}` : 'Peer reviewer'}
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[13px] font-medium text-amber-900">
              {tasks.length} open {tasks.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={periodMonth} onValueChange={setPeriodMonth}>
            <SelectTrigger className="h-10 w-[140px] rounded-2xl text-sm"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              {monthOptions().map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={periodQuarter} onValueChange={setPeriodQuarter}>
            <SelectTrigger className="h-10 w-[140px] rounded-2xl text-sm"><SelectValue placeholder="Quarter" /></SelectTrigger>
            <SelectContent>
              {quarterOptions().map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className={softButton} onClick={() => void load()}>Refresh</Button>
        </div>
      </div>

      {canUseHrMonitor && isCompanyAdmin && !isPlatformAdmin && tab !== 'admin' && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p>
            <span className="font-medium">People Ops / HR</span>
            {' — '}track Q3 completion, release peer 360 when ready, and review named feedback in{' '}
            <strong>HR Monitor</strong>.
          </p>
          <Button size="sm" variant="secondary" className={cn(softButton, 'shrink-0')} onClick={() => setTab('admin')}>
            Open HR Monitor
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="app-sticky-subnav -mx-4 bg-background/95 px-4 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <TabsList className="flex h-auto flex-wrap gap-2 border-0 bg-transparent p-0">
          <TabsTrigger value="tasks" className="gap-1.5 rounded-full px-3.5 py-2 font-sans text-[13.5px] font-medium normal-case tracking-normal data-[state=active]:bg-teal-500 data-[state=active]:text-white"><NotebookPen className="h-4 w-4" /> Tasks</TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5 rounded-full px-3.5 py-2 font-sans text-[13.5px] font-medium normal-case tracking-normal data-[state=active]:bg-teal-500 data-[state=active]:text-white"><TrendingUp className="h-4 w-4" /> My results</TabsTrigger>
          <TabsTrigger value="directory" className="gap-1.5 rounded-full px-3.5 py-2 font-sans text-[13.5px] font-medium normal-case tracking-normal data-[state=active]:bg-teal-500 data-[state=active]:text-white"><Users className="h-4 w-4" /> Directory</TabsTrigger>
          {ENABLE_APP_AI && (
            <TabsTrigger value="assist" className="gap-1.5 rounded-full px-3.5 py-2 font-sans text-[13.5px] font-medium normal-case tracking-normal data-[state=active]:bg-teal-500 data-[state=active]:text-white"><Sparkles className="h-4 w-4" /> AI assist</TabsTrigger>
          )}
          {canUseHrMonitor && (
            <TabsTrigger value="admin" className="gap-1.5 rounded-full px-3.5 py-2 font-sans text-[13.5px] font-medium normal-case tracking-normal data-[state=active]:bg-teal-500 data-[state=active]:text-white"><LayoutDashboard className="h-4 w-4" /> {isCompanyAdmin && !isPlatformAdmin ? 'HR monitor' : 'Monitor'}</TabsTrigger>
          )}
        </TabsList>
        </div>

        <TabsContent value="tasks" className="mt-0 space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive space-y-2">
              <p className="font-medium">Could not load {org} tasks</p>
              <p className="text-destructive/90 leading-relaxed">{loadError}</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground space-y-1">
              <p>No open {org} tasks for {periodMonth} / {periodQuarter}.</p>
              <p className="text-xs">
                Managers should see monthly + quarterly evaluation rows for their reports; everyone should see a monthly self check-in plus peer 360s for the rest of the active roster.
              </p>
            </div>
          ) : (
            <>
              {(['monthly_self', 'monthly_manager', 'peer_360', 'quarterly_evaluation', 'acknowledge_evaluation'] as const).map((kind) => {
                const list = grouped.get(kind);
                if (!list?.length) return null;
                const look = KIND_LOOK[kind];
                const Icon = look.icon;
                return (
                  <section key={kind} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', look.chip)}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-display text-lg font-semibold">{look.title}</h3>
                        <p className="text-sm text-muted-foreground">{list.length} {list.length === 1 ? 'person' : 'people'}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {list.map((row) => (
                        <article key={`${row.kind}-${row.subject_id}-${row.period}`} className="flex flex-col justify-between gap-3 rounded-2xl bg-muted/40 p-4">
                          <div>
                            <p className="text-[15px] font-medium">{row.subject_name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {displayHierarchyLabel(levelById[row.subject_id], true, { appraisalMode: tenant.appraisalMode })}
                              {' · '}
                              {row.period}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            {statusBadge(row.status)}
                            <Button
                              size="sm"
                              className={cn(softButton, row.status === 'submitted' || row.status === 'acknowledged' ? '' : 'bg-teal-500 text-white hover:bg-teal-600')}
                              variant={row.status === 'submitted' || row.status === 'acknowledged' ? 'outline' : 'default'}
                              onClick={() => openTask(row)}
                            >
                              {row.status === 'todo' ? 'Start' : row.status === 'draft' ? 'Continue' : row.kind === 'acknowledge_evaluation' && row.status === 'submitted' ? 'Acknowledge' : 'Open'}
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
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
          <GhcDirectoryPanel
            periodQuarter={periodQuarter}
            periodMonth={periodMonth}
            viewerEmployeeId={employeeId}
          />
        </TabsContent>

        {ENABLE_APP_AI && (
          <TabsContent value="assist" className="mt-0">
            <GhcAiAssistCard employeeName={employeeName} periodMonth={periodMonth} periodQuarter={periodQuarter} />
          </TabsContent>
        )}

        {canUseHrMonitor && (
          <TabsContent value="admin" className="mt-0">
            <GhcAdminMonitor
              periodQuarter={periodQuarter}
              periodMonth={periodMonth}
              hrMode={isCompanyAdmin && !isPlatformAdmin}
            />
          </TabsContent>
        )}
      </Tabs>

      {runner?.kind === 'monthly_self' && (
        <GhcMonthlySelfCheckinRunner
          open
          onOpenChange={(open) => { if (!open) setRunner(null); }}
          task={runner}
          onSaved={() => { setRunner(null); void load(); }}
        />
      )}
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

