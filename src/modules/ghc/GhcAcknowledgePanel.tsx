import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ghcAcknowledgeEvaluation, ghcGetQuarterlyEvaluation, type GhcTaskRow } from './ghcApi';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';

export default function GhcAcknowledgePanel({
  task,
  onDone,
  embedded = false,
}: {
  task: GhcTaskRow;
  onDone: () => void;
  embedded?: boolean;
}) {
  const [understanding, setUnderstanding] = useState('');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!task.record_id) return;
    void ghcGetQuarterlyEvaluation(task.record_id).then((row) => {
      setSummary(row);
      setUnderstanding(row?.employee_understanding ?? '');
      setResponse(row?.employee_response ?? '');
    });
  }, [task.record_id]);

  const submit = async () => {
    if (!task.record_id) return;
    if (understanding.trim().length < 10) {
      toast.error('Document your understanding of expectations.');
      return;
    }
    setBusy(true);
    try {
      await ghcAcknowledgeEvaluation({
        evaluation_id: task.record_id,
        understanding: understanding.trim(),
        employee_response: response.trim(),
      });
      toast.success('Evaluation acknowledged');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not acknowledge');
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="space-y-4">
      {summary && (
        <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs space-y-1">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="font-semibold">Score</span>
            <Badge variant="secondary">{String(summary.total_score ?? '—')}/35</Badge>
            <Badge variant="outline">{String(summary.total_pct ?? '—')}%</Badge>
            <Badge>Band {String(summary.band_rating ?? '—')}</Badge>
          </div>
          <p className="text-muted-foreground">Status: {String(summary.status)}</p>
        </div>
      )}
      <div className="space-y-2">
        <Label>Your understanding of expectations & milestones</Label>
        <Textarea value={understanding} onChange={(e) => setUnderstanding(e.target.value)} rows={4} />
      </div>
      <div className="space-y-2">
        <Label>Feedback to your manager and GreenHouse Capital</Label>
        <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={4} />
      </div>
      {summary?.status !== 'acknowledged' && (
        <Button disabled={busy} onClick={() => void submit()}>Acknowledge evaluation</Button>
      )}
    </div>
  );

  if (embedded) {
    return <div className="glass-panel p-5 space-y-3"><h3 className="text-sm font-semibold">Acknowledge quarterly evaluation</h3>{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 sm:items-center">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-background p-5 shadow-xl space-y-3">
        <h3 className="text-sm font-semibold">Acknowledge quarterly evaluation</h3>
        {body}
        <Button variant="ghost" onClick={onDone}>Close</Button>
      </div>
    </div>
  );
}
