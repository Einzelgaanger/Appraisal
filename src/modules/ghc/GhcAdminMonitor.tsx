import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  ghcAdminCompletionRoster,
  ghcAdminCycleStatus,
  ghcAdminList360Named,
  ghcAdminListEvaluations,
  ghcGetAdminSummary,
  ghcGetPartnerRecommendations,
  ghcReleasePeriod,
  ghcUpsertPartnerRecommendation,
  type GhcNamed360Row,
} from './ghcApi';
import { GHC_PARTNER_ACTIONS, GHC_CULTURE_VALUES } from './ghcConstants';

function formatReleased(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function GhcAdminMonitor({
  periodQuarter,
  periodMonth,
  hrMode = false,
}: {
  periodQuarter: string;
  periodMonth: string;
  /** People Ops (company admin) — plainer copy, same capabilities. */
  hrMode?: boolean;
}) {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [roster, setRoster] = useState<Array<{
    id: string;
    name: string;
    email: string | null;
    role: string | null;
    monthly_self_done: boolean;
    peer_360_given: number;
    peer_360_expected: number;
    peer_360_done: boolean;
  }>>([]);
  const [evals, setEvals] = useState<Array<{
    id: string;
    status: string;
    total_score: number | null;
    total_pct: number | null;
    employee_name: string | null;
    manager_name: string | null;
  }>>([]);
  const [named360, setNamed360] = useState<GhcNamed360Row[]>([]);
  const [cycle, setCycle] = useState<{
    peer_360_released_at: string | null;
    quarterly_evaluation_released_at: string | null;
  } | null>(null);
  const [selected360, setSelected360] = useState<GhcNamed360Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [evalId, setEvalId] = useState('');
  const [partnerDrafts, setPartnerDrafts] = useState<Record<string, string>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, list, people, named, status] = await Promise.all([
        ghcGetAdminSummary(periodQuarter, periodMonth),
        ghcAdminListEvaluations(periodQuarter).catch(() => []),
        ghcAdminCompletionRoster(periodQuarter, periodMonth).catch(() => []),
        ghcAdminList360Named(periodQuarter).catch(() => [] as GhcNamed360Row[]),
        ghcAdminCycleStatus(periodQuarter).catch(() => null),
      ]);
      setSummary(s as Record<string, number>);
      setEvals(list);
      setRoster(people);
      setNamed360(named);
      setCycle(status);
      if (!evalId && list[0]?.id) setEvalId(list[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Admin summary failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodQuarter, periodMonth]);

  useEffect(() => {
    if (!evalId) {
      setPartnerDrafts({});
      return;
    }
    void ghcGetPartnerRecommendations(evalId)
      .then((rows) => {
        const next: Record<string, string> = {};
        for (const r of rows as Array<{
          action_option: string;
          partners_decision?: string | null;
          recommendation_by_manager?: string | null;
          recommendation_by_hr?: string | null;
        }>) {
          next[r.action_option] =
            r.partners_decision ||
            r.recommendation_by_hr ||
            r.recommendation_by_manager ||
            '';
        }
        setPartnerDrafts(next);
      })
      .catch(() => setPartnerDrafts({}));
  }, [evalId]);

  const release = async (kind: 'peer_360' | 'quarterly_evaluation') => {
    try {
      await ghcReleasePeriod(kind, periodQuarter);
      toast.success(
        kind === 'peer_360'
          ? `Peer 360 opened for ${periodQuarter} — employees can now see anonymous scores`
          : `Evaluation period marked released for ${periodQuarter}`,
      );
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Release failed');
    }
  };

  const savePartner = async (action: string) => {
    if (!evalId) {
      toast.error('Pick an evaluation first');
      return;
    }
    try {
      await ghcUpsertPartnerRecommendation({
        evaluation_id: evalId,
        action_option: action,
        partners_decision: partnerDrafts[action] || null,
      });
      toast.success('Partner row updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading monitor…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hrMode && (
        <div className="rounded-3xl bg-gradient-to-r from-teal-50 via-white to-amber-50 p-5 ring-1 ring-teal-100">
          <p className="text-sm text-muted-foreground">People Ops</p>
          <h3 className="mt-1 font-display text-xl font-semibold">HR monitor — {periodQuarter}</h3>
          <p className="text-xs text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            See who has finished self check-in and 360, and review named 360 responses below (HR-only).
            Employees already see anonymous aggregates together. There is no release step.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Roster', value: summary?.roster ?? 0 },
          { label: 'Self check-in done', value: summary?.monthlySelfSubmitted ?? 0 },
          { label: 'Self check-in open', value: summary?.monthlySelfOpen ?? 0 },
          { label: '360 submitted', value: `${summary?.peer360Submitted ?? 0}/${summary?.peer360Expected ?? 0}` },
        ].map((s) => (
          <div key={s.label} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="font-display text-2xl font-semibold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold">360 results</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Peer 360 for <strong>{periodQuarter}</strong> is open for everyone at the same time. There is no HR release
          step. Employees see anonymous aggregates only. Named reviews stay in the section below for People Ops.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="text-[10px]">
            Visible to everyone
          </Badge>
          {cycle?.quarterly_evaluation_released_at ? (
            <Badge variant="secondary" className="text-[10px]">
              Eval marked released {formatReleased(cycle.quarterly_evaluation_released_at)}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void release('quarterly_evaluation')}>
            Mark eval period released
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="glass-panel p-5 space-y-3 overflow-x-auto">
        <h3 className="text-sm font-semibold">Who has completed self check-in &amp; 360</h3>
        <p className="text-xs text-muted-foreground">
          Month {periodMonth} · Quarter {periodQuarter}. 360 “done” means they submitted feedback for every other active
          teammate.
        </p>
        {roster.length === 0 ? (
          <p className="text-xs text-muted-foreground">No roster rows.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Self check-in</th>
                <th className="pb-2">360 given</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3 font-medium">
                    {r.name}
                    <span className="ml-2 text-[10px] text-muted-foreground">{r.email}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge variant={r.monthly_self_done ? 'default' : 'outline'} className="text-[10px]">
                      {r.monthly_self_done ? 'Done' : 'Not done'}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <Badge variant={r.peer_360_done ? 'default' : 'outline'} className="text-[10px]">
                      {r.peer_360_given}/{r.peer_360_expected} {r.peer_360_done ? 'Done' : 'Not done'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold">Named peer 360 (People Ops only)</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This is where “identity kept for HR” lives — reviewer names + full answers for {periodQuarter}. Employees never
          see this list.
        </p>
        {named360.length === 0 ? (
          <p className="text-xs text-muted-foreground">No submitted 360s for this quarter yet.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {named360.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelected360(row)}
                className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                  selected360?.id === row.id ? 'border-primary bg-primary/5' : 'border-border/50'
                }`}
              >
                <span className="font-medium">{row.reviewer_name}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium">{row.reviewee_name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {row.status}
                </Badge>
              </button>
            ))}
          </div>
        )}
        {selected360 && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3 text-xs">
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>
                From <strong className="text-foreground">{selected360.reviewer_name}</strong> (
                {selected360.reviewer_email})
              </span>
              <span>
                About <strong className="text-foreground">{selected360.reviewee_name}</strong>
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {GHC_CULTURE_VALUES.map((c) => {
                const scoreKey = `score_${c.key}` as keyof GhcNamed360Row;
                const exampleKey = `example_${c.key}` as keyof GhcNamed360Row;
                return (
                  <div key={c.key} className="rounded border border-border/40 p-2">
                    <p className="font-medium">{c.label}</p>
                    <p className="text-muted-foreground">
                      Score: {String(selected360[scoreKey] ?? '—')} · {String(selected360[exampleKey] || '—')}
                    </p>
                  </div>
                );
              })}
            </div>
            {selected360.did_well ? (
              <p>
                <span className="font-medium">Did well: </span>
                {selected360.did_well}
              </p>
            ) : null}
            {selected360.additional_comments ? (
              <p>
                <span className="font-medium">Additional: </span>
                {selected360.additional_comments}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold">Submitted evaluations ({periodQuarter})</h3>
        {evals.length === 0 ? (
          <p className="text-xs text-muted-foreground">No submitted evaluations yet.</p>
        ) : (
          <div className="space-y-2">
            {evals.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setEvalId(ev.id)}
                className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                  evalId === ev.id ? 'border-primary bg-primary/5' : 'border-border/50'
                }`}
              >
                <span className="font-medium">{ev.employee_name}</span>
                <span className="text-muted-foreground">via {ev.manager_name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {ev.status}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {ev.total_score ?? '—'}/35
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold">Partners recommendation board</h3>
        <Input
          placeholder="Evaluation UUID (auto-filled when you pick a row above)"
          value={evalId}
          onChange={(e) => setEvalId(e.target.value)}
          className="font-mono text-xs"
        />
        <div className="space-y-2">
          {GHC_PARTNER_ACTIONS.map((action) => (
            <div
              key={action}
              className="flex flex-col gap-2 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-center"
            >
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {action}
              </Badge>
              <Input
                placeholder="Partners decision / notes"
                value={partnerDrafts[action] || ''}
                onChange={(e) => setPartnerDrafts((prev) => ({ ...prev, [action]: e.target.value }))}
              />
              <Button size="sm" variant="secondary" onClick={() => void savePartner(action)}>
                Save
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
