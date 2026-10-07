import { useCallback, useEffect, useState } from 'react';
import { useQuietLoader } from '@/hooks/useQuietLoader';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Users, Eye, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { defaultMonthPeriod, defaultQuarterPeriod } from '@/lib/boomPeriods';
import {
  fetchEaQuarterlyStatusRoster,
  boomScoreBand,
  type EaQuarterlyStatusRow,
} from '@/lib/boomEaQuarterly';
import { cn } from '@/lib/utils';

const EO_SUBSIDIARY = '11111111-1111-1111-1111-111111111111';

type RosterRow = {
  employee_id: string;
  name: string;
  email: string | null;
  role: string | null;
  department: string | null;
  department_code: string | null;
  manager_name: string | null;
};

type EaSubmission = {
  reviewer_id: string;
  reviewer_name: string;
  status: string;
  submitted_at: string | null;
  avg_score: number | null;
  score_pct: number | null;
};

type Insight = {
  employee_id?: string;
  name?: string;
  monthly_self_status?: string;
  executive_self_status?: string;
  peer_360_released?: boolean;
  can_view_360?: boolean;
  peer_360_sections?: { section: string; avg_score: number; response_count: number }[];
  peer_360_by_relation?: { relation: string; avg_score: number; response_count: number }[];
  ea_quarterly_expected?: number;
  ea_quarterly_submitted?: number;
  ea_quarterly_status?: string;
  ea_quarterly_submissions?: EaSubmission[];
};

function parseInsight(data: unknown): Insight | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (
    !o.employee_id &&
    o.monthly_self_status == null &&
    o.executive_self_status == null &&
    o.ea_quarterly_status == null
  ) {
    return null;
  }
  return data as Insight;
}

const RELATION_LABELS: Record<string, string> = {
  up: 'From leaders (up)',
  down: 'From team (down)',
  lateral: 'From peers (lateral)',
  self: 'Self',
};

function eaStatusBadge(status: string | undefined) {
  switch (status) {
    case 'complete':
      return { label: 'EA complete', className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' };
    case 'partial':
      return { label: 'EA partial', className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' };
    case 'in_progress':
      return { label: 'EA in progress', className: 'bg-blue-500/15 text-blue-700 border-blue-500/30' };
    default:
      return { label: 'EA todo', className: 'bg-muted text-muted-foreground border-border' };
  }
}

const COMPANY_DIRECTORY_CODES = new Set(['l1_uche', 'l1_omotola', 'l1_deyi']);

interface BoomDirectoryPanelProps {
  viewerEmployeeId?: string | null;
  viewerHierarchyLevel: number | null;
  isAdmin: boolean;
  periodQuarter?: string;
  periodMonth?: string;
}

export default function BoomDirectoryPanel({
  viewerEmployeeId = null,
  viewerHierarchyLevel,
  isAdmin,
  periodQuarter = defaultQuarterPeriod(),
  periodMonth = defaultMonthPeriod(),
}: BoomDirectoryPanelProps) {
  const [loading, setLoading] = useState(true);
  const { start: startLoading, finish: finishLoading } = useQuietLoader(setLoading);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [eaRoster, setEaRoster] = useState<EaQuarterlyStatusRow[]>([]);
  const [selected, setSelected] = useState<RosterRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  const canView = isAdmin || (viewerHierarchyLevel !== null && viewerHierarchyLevel <= 1);

  const load = useCallback(async () => {
    if (!canView) {
      setRows([]);
      setEaRoster([]);
      finishLoading();
      return;
    }
    startLoading();
    const [rosterRes, eaStatus] = await Promise.all([
      supabase.rpc('get_eo_directory_roster'),
      fetchEaQuarterlyStatusRoster(periodQuarter),
    ]);
    setEaRoster(eaStatus);

    const { data, error } = rosterRes;
    if (!error && Array.isArray(data)) {
      setRows(data as RosterRow[]);
    } else if (isAdmin || viewerHierarchyLevel === 0 || viewerHierarchyLevel === 1) {
      const viewer = viewerEmployeeId
        ? await supabase
            .from('employees')
            .select('department_code')
            .eq('id', viewerEmployeeId)
            .maybeSingle()
        : { data: null };
      const companyDirectory =
        isAdmin ||
        viewerHierarchyLevel === 0 ||
        COMPANY_DIRECTORY_CODES.has(viewer.data?.department_code ?? '');
      let query = supabase
        .from('employees')
        .select('id, name, email, role, department, department_code, manager_id, secondary_manager_id, manager:manager_id(name)')
        .eq('subsidiary_id', EO_SUBSIDIARY)
        .eq('hierarchy_level', 2)
        .eq('eo_appraisal_active', true)
        .order('name');
      if (!companyDirectory && viewerEmployeeId) {
        query = query.or(`manager_id.eq.${viewerEmployeeId},secondary_manager_id.eq.${viewerEmployeeId}`);
      }
      const { data: fallback } = await query;
      setRows(
        (fallback ?? []).map((e: Record<string, unknown>) => ({
          employee_id: e.id as string,
          name: e.name as string,
          email: e.email as string | null,
          role: e.role as string | null,
          department: e.department as string | null,
          department_code: e.department_code as string | null,
          manager_name: (e.manager as { name?: string } | null)?.name ?? null,
        })),
      );
    } else {
      setRows([]);
    }
    finishLoading();
  }, [canView, finishLoading, isAdmin, startLoading, viewerEmployeeId, viewerHierarchyLevel, periodQuarter]);

  useEffect(() => {
    void load();
  }, [load]);

  const eaById = Object.fromEntries(eaRoster.map((r) => [r.employee_id, r]));

  const openInsight = async (row: RosterRow) => {
    setSelected(row);
    setInsight(null);
    setDialogOpen(true);
    setInsightLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_eo_employee_insight', {
        _employee_id: row.employee_id,
        _period_quarter: periodQuarter,
        _period_month: periodMonth,
      });
      if (error) {
        toast.error(error.message);
        setInsight(null);
        return;
      }
      setInsight(parseInsight(data));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not load colleague insight');
      setInsight(null);
    } finally {
      setInsightLoading(false);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelected(null);
    setInsight(null);
  };

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        The team directory is available to Executive leadership (L0/L1) and admins.
      </p>
    );
  }

  const eaComplete = eaRoster.filter((r) => r.status === 'complete').length;
  const eaPartial = eaRoster.filter((r) => r.status === 'partial' || r.status === 'in_progress').length;

  return (
    <>
      {eaRoster.length > 0 && (
        <div className="glass-panel p-5 space-y-3 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">Executive Office Quarterly Evaluation</h4>
              <Badge variant="outline" className="text-[10px] font-mono">
                {periodQuarter}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {eaComplete} complete · {eaPartial} in progress · {eaRoster.length - eaComplete - eaPartial} todo
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Updates automatically when a line manager submits an Executive Office Quarterly Evaluation. Open a person below for
            who completed it and their cumulative %.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
            {eaRoster.map((row) => {
              const badge = eaStatusBadge(row.status);
              const latest = row.submissions?.find((s) => s.status === 'submitted');
              return (
                <div
                  key={row.employee_id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.employee_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {row.submitted_count}/{row.expected_reviewers} manager
                      {row.expected_reviewers === 1 ? '' : 's'}
                      {latest?.reviewer_name ? ` · last: ${latest.reviewer_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {latest?.score_pct != null && (
                      <span className="font-mono text-[11px] font-semibold">{latest.score_pct}%</span>
                    )}
                    <Badge variant="outline" className={cn('text-[9px]', badge.className)}>
                      {badge.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass-panel p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold">Team directory</h4>
          <Badge variant="outline" className="text-[10px]">Level 2 · masked 360</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Open a colleague to see monthly self status, Executive Office Quarterly Evaluation completion, performance self status, and
          aggregated anonymous 360 (no reviewer names).
        </p>
        {loading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading roster…
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => {
              const ea = eaById[row.employee_id];
              const badge = ea ? eaStatusBadge(ea.status) : null;
              return (
                <button
                  key={row.employee_id}
                  type="button"
                  onClick={() => void openInsight(row)}
                  className="text-left rounded-xl border border-border p-3 hover:border-primary/40 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{row.name}</p>
                    {badge && (
                      <Badge variant="outline" className={cn('text-[9px] shrink-0', badge.className)}>
                        {badge.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{row.role ?? '—'}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {row.department_code ?? row.department ?? '—'}
                    {row.manager_name ? ` · ${row.manager_name}` : ''}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              {selected?.name}
            </DialogTitle>
          </DialogHeader>
          {insightLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </p>
          ) : insight ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Monthly self</p>
                  <p className="font-medium">{insight.monthly_self_status ?? '—'}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Performance self</p>
                  <p className="font-medium">{insight.executive_self_status ?? '—'}</p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Executive Office Quarterly Evaluation ({periodQuarter})</p>
                  <Badge
                    variant="outline"
                    className={cn('text-[9px]', eaStatusBadge(insight.ea_quarterly_status).className)}
                  >
                    {eaStatusBadge(insight.ea_quarterly_status).label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {(insight.ea_quarterly_submitted ?? 0) > 0
                    ? 'Submitted once for this quarter. Other assigned managers can view it and cannot file a second one.'
                    : 'Not submitted yet. The first assigned manager to complete it covers this quarter.'}
                </p>
                {(insight.ea_quarterly_submissions ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No Executive Office Quarterly Evaluation started for this period yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(insight.ea_quarterly_submissions ?? []).map((s) => (
                      <li
                        key={`${s.reviewer_id}-${s.status}-${s.submitted_at ?? 'x'}`}
                        className="flex justify-between gap-2 text-xs border-b border-border/40 py-1.5"
                      >
                        <span>
                          {s.reviewer_name}
                          <span className="text-muted-foreground"> · {s.status}</span>
                        </span>
                        <span className="font-mono shrink-0">
                          {s.status === 'submitted' && s.score_pct != null
                            ? `${s.score_pct}% (${s.avg_score}/5 · ${boomScoreBand(s.avg_score)})`
                            : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-[10px] uppercase text-muted-foreground mb-2">360 (anonymous aggregate)</p>
                {insight.can_view_360 === false ? (
                  <p className="text-xs text-muted-foreground">
                    360 aggregates for this person are not shown at your level (e.g. L1 peers for executives).
                  </p>
                ) : !insight.peer_360_sections?.length ? (
                  <p className="text-xs text-muted-foreground">No peer 360 scores for {periodQuarter} yet.</p>
                ) : (
                  <>
                    {insight.peer_360_by_relation && insight.peer_360_by_relation.length > 0 && (
                      <div className="mb-3 space-y-1">
                        <p className="text-[10px] text-muted-foreground mb-1">By relation</p>
                        {insight.peer_360_by_relation.map((r) => (
                          <div
                            key={r.relation}
                            className="flex justify-between text-xs border-b border-border/40 py-1"
                          >
                            <span>{RELATION_LABELS[r.relation] ?? r.relation}</span>
                            <span className="font-mono">
                              {r.avg_score} ({r.response_count})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <ul className="space-y-1">
                      {insight.peer_360_sections?.map((s) => (
                        <li key={s.section} className="flex justify-between text-xs border-b border-border/40 py-1">
                          <span>{s.section}</span>
                          <span className="font-mono">
                            {s.avg_score} ({s.response_count})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Could not load insight for this colleague.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => selected && void openInsight(selected)}
              >
                Retry
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={closeDialog}>
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
