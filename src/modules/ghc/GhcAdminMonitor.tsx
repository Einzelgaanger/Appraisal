import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  ghcAdminListEvaluations,
  ghcGetAdminSummary,
  ghcReleasePeriod,
  ghcUpsertPartnerRecommendation,
} from './ghcApi';
import { GHC_PARTNER_ACTIONS } from './ghcConstants';

export default function GhcAdminMonitor({
  periodQuarter,
  periodMonth,
}: {
  periodQuarter: string;
  periodMonth: string;
}) {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [evals, setEvals] = useState<Array<{
    id: string;
    status: string;
    total_score: number | null;
    total_pct: number | null;
    employee_name: string | null;
    manager_name: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [evalId, setEvalId] = useState('');
  const [partnerDrafts, setPartnerDrafts] = useState<Record<string, string>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, list] = await Promise.all([
        ghcGetAdminSummary(periodQuarter, periodMonth),
        ghcAdminListEvaluations(periodQuarter).catch(() => []),
      ]);
      setSummary(s as Record<string, number>);
      setEvals(list);
      if (!evalId && list[0]?.id) setEvalId(list[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Admin summary failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [periodQuarter, periodMonth]);

  const release = async (kind: 'peer_360' | 'quarterly_evaluation') => {
    try {
      await ghcReleasePeriod(kind, periodQuarter);
      toast.success(`${kind} released for ${periodQuarter}`);
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Roster', value: summary?.roster ?? 0 },
          { label: 'Monthly submitted', value: summary?.monthlySubmitted ?? 0 },
          { label: '360 submitted', value: summary?.peer360Submitted ?? 0 },
          { label: 'Evals submitted', value: summary?.evaluationsSubmitted ?? 0 },
        ].map((s) => (
          <div key={s.label} className="glass-panel p-4">
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold">Release gates</h3>
        <p className="text-xs text-muted-foreground">
          Releasing 360 makes anonymous aggregates visible to subjects. Partner actions stay HR/admin controlled.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void release('peer_360')}>Release peer 360 ({periodQuarter})</Button>
          <Button size="sm" variant="outline" onClick={() => void release('quarterly_evaluation')}>
            Mark eval period released
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>Refresh</Button>
        </div>
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
                <Badge variant="outline" className="text-[10px]">{ev.status}</Badge>
                <Badge variant="secondary" className="text-[10px]">{ev.total_score ?? '—'}/35</Badge>
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
            <div key={action} className="flex flex-col gap-2 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-center">
              <Badge variant="outline" className="shrink-0 text-[10px]">{action}</Badge>
              <Input
                placeholder="Partners decision / notes"
                value={partnerDrafts[action] || ''}
                onChange={(e) => setPartnerDrafts((prev) => ({ ...prev, [action]: e.target.value }))}
              />
              <Button size="sm" variant="secondary" onClick={() => void savePartner(action)}>Save</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
