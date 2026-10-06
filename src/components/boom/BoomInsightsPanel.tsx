import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuietLoader } from '@/hooks/useQuietLoader';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, LayoutDashboard } from 'lucide-react';
import BoomDirectoryPanel from './BoomDirectoryPanel';
import { defaultQuarterPeriod, quarterOptions } from '@/lib/boomPeriods';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';

type Overview = {
  period?: string;
  peer_360_released?: boolean;
  l1_inbound_to_l0?: { reviewee_name: string; avg_score: number; response_count: number }[];
  l2_peer_scores?: { name: string; department_code: string | null; avg_score: number; response_count: number }[];
  l1_rated_breakdown?: {
    name: string;
    from_l2_avg: number | null;
    from_l2_count: number;
    from_l1_avg: number | null;
    from_l1_count: number;
  }[];
  l2_receive_split?: {
    name: string;
    department_code: string | null;
    from_l1_avg: number | null;
    from_l1_count: number;
    from_l2_avg: number | null;
    from_l2_count: number;
  }[];
};

interface BoomInsightsPanelProps {
  viewerHierarchyLevel: number | null;
  isAdmin: boolean;
  periodQuarter?: string;
  onPeriodQuarterChange?: (q: string) => void;
}

function heatColor(score: number | null | undefined): string {
  if (score == null) return 'hsl(var(--muted))';
  if (score >= 4) return 'hsl(142 60% 42% / 0.35)';
  if (score >= 3) return 'hsl(45 80% 50% / 0.3)';
  return 'hsl(0 70% 50% / 0.25)';
}

function fmtScore(v: number | null | undefined, n: number): string {
  if (v == null || n < 1) return '—';
  return `${v.toFixed(2)} (${n})`;
}

export default function BoomInsightsPanel({
  viewerHierarchyLevel,
  isAdmin,
  periodQuarter: periodQuarterProp,
  onPeriodQuarterChange,
}: BoomInsightsPanelProps) {
  const [localQuarter, setLocalQuarter] = useState(() => defaultQuarterPeriod());
  const periodQuarter = periodQuarterProp ?? localQuarter;
  const setPeriodQuarter = onPeriodQuarterChange ?? setLocalQuarter;
  const [loading, setLoading] = useState(true);
  const { start: startLoading, finish: finishLoading } = useQuietLoader(setLoading);
  const [overview, setOverview] = useState<Overview | null>(null);

  const canView = isAdmin || viewerHierarchyLevel === 0;

  const load = useCallback(async () => {
    if (!canView) {
      finishLoading();
      return;
    }
    startLoading();
    const { data, error } = await supabase.rpc('get_eo_executive_overview', {
      _period_quarter: periodQuarter,
    });
    setOverview(error ? null : (data as Overview));
    finishLoading();
  }, [canView, finishLoading, periodQuarter, startLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const l1Chart = useMemo(
    () =>
      (overview?.l1_inbound_to_l0 ?? []).map((r) => ({
        name: r.reviewee_name.split(' ')[0],
        score: r.avg_score ?? 0,
        count: r.response_count,
      })),
    [overview],
  );

  const l1RatedChart = useMemo(
    () =>
      (overview?.l1_rated_breakdown ?? []).map((r) => ({
        name: r.name.split(' ')[0],
        fromL2: r.from_l2_avg ?? 0,
        fromL1: r.from_l1_avg ?? 0,
        l2n: r.from_l2_count,
        l1n: r.from_l1_count,
      })),
    [overview],
  );

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        Executive insights are for the top leadership tier (L0) and platform admins.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold">Executive feedback overview</h4>
          </div>
          <Select value={periodQuarter} onValueChange={setPeriodQuarter}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue>{periodQuarter}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {quarterOptions().map((q) => (
                <SelectItem key={q} value={q} className="text-xs">
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Anonymous aggregates for the EO org: L1 inbound to L0, how L2 peers rate each other, how L1 leads are
          rated by L2 vs L1 peers, and how each L2 receives feedback from L1 vs lateral peers. Drill into any
          person in the directory for self-assessment status and 360 by relation.
        </p>
        {loading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading insights…
          </p>
        ) : !overview ? (
          <p className="text-xs text-muted-foreground">
            Could not load executive overview. Run the BOOM org migration if this is the first deploy.
          </p>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <h5 className="text-xs font-semibold">L1 inbound to L0</h5>
                <Badge variant="outline" className="text-[10px]">anonymous</Badge>
              </div>
              {l1Chart.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No L1 → L0 peer reviews submitted yet.</p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={l1Chart}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 11 }}
                        formatter={(v: number, _n, p) => [
                          `${v.toFixed(2)} · ${(p.payload as { count: number }).count} reviews`,
                          'Avg',
                        ]}
                      />
                      <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h5 className="text-xs font-semibold">L2 lateral peer scores (received)</h5>
              {(overview.l2_peer_scores ?? []).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No L2 lateral 360 data yet.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(overview.l2_peer_scores ?? []).map((r) => ({
                        name: r.name.split(' ')[0],
                        score: r.avg_score ?? 0,
                        dept: r.department_code,
                      }))}
                      margin={{ bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={50} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                        {(overview.l2_peer_scores ?? []).map((r) => (
                          <Cell key={r.name} fill={heatColor(r.avg_score)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h5 className="text-xs font-semibold">L1 rated by L2 vs L1 peers</h5>
              {l1RatedChart.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No L1 rating data yet.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={l1RatedChart}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="fromL2" name="From L2 (up)" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="fromL1" name="From L1 (lateral)" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h5 className="text-xs font-semibold">L2 receive: L1 vs peer (heatmap)</h5>
              {(overview.l2_receive_split ?? []).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No L2 receive data yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left p-2 font-medium">Name</th>
                        <th className="text-left p-2 font-medium">Pod</th>
                        <th className="text-center p-2 font-medium">From L1 (up)</th>
                        <th className="text-center p-2 font-medium">From L2 peers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overview.l2_receive_split ?? []).map((row) => (
                        <tr key={row.name} className="border-b border-border/50">
                          <td className="p-2 font-medium">{row.name}</td>
                          <td className="p-2 text-muted-foreground">{row.department_code ?? '—'}</td>
                          <td
                            className="p-2 text-center font-mono"
                            style={{ background: heatColor(row.from_l1_avg) }}
                          >
                            {fmtScore(row.from_l1_avg, row.from_l1_count)}
                          </td>
                          <td
                            className="p-2 text-center font-mono"
                            style={{ background: heatColor(row.from_l2_avg) }}
                          >
                            {fmtScore(row.from_l2_avg, row.from_l2_count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      <BoomDirectoryPanel viewerHierarchyLevel={0} isAdmin={isAdmin} periodQuarter={periodQuarter} />
    </div>
  );
}
