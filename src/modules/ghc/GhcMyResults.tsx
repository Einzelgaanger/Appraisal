import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  ghcGetDiscussion,
  ghcGetMy360Aggregate,
  ghcGetQuarterlyEvaluation,
  ghcPostDiscussionMessage,
  type GhcTaskRow,
} from './ghcApi';
import GhcAcknowledgePanel from './GhcAcknowledgePanel';

export default function GhcMyResults({
  periodQuarter,
  acknowledgeTask,
  onAcknowledged,
}: {
  periodQuarter: string;
  acknowledgeTask: GhcTaskRow | null;
  onAcknowledged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [agg, setAgg] = useState<{
    released: boolean;
    peerCount: number;
    scores: Array<{ key: string; label: string; avg: number }>;
    themes: Array<{ text: string }>;
  } | null>(null);
  const [evalRow, setEvalRow] = useState<Record<string, unknown> | null>(null);
  const [discussion, setDiscussion] = useState<{ messages: Array<{ id: string; authorName: string; body: string; createdAt: string }> } | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await ghcGetMy360Aggregate(periodQuarter);
        if (!cancelled) setAgg(data);
      } catch {
        if (!cancelled) setAgg(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [periodQuarter]);

  useEffect(() => {
    if (!acknowledgeTask?.record_id) {
      setEvalRow(null);
      return;
    }
    void ghcGetQuarterlyEvaluation(acknowledgeTask.record_id).then(async (row) => {
      setEvalRow(row);
      if (row?.id) {
        const d = await ghcGetDiscussion(row.id);
        setDiscussion({ messages: d?.messages ?? [] });
      }
    });
  }, [acknowledgeTask?.record_id]);

  const postMsg = async () => {
    if (!acknowledgeTask?.record_id || !msg.trim()) return;
    try {
      await ghcPostDiscussionMessage(acknowledgeTask.record_id, msg.trim());
      setMsg('');
      const d = await ghcGetDiscussion(acknowledgeTask.record_id);
      setDiscussion({ messages: d?.messages ?? [] });
      toast.success('Message posted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold">Anonymous peer 360</h3>
          <Badge variant="outline" className="text-[10px]">{periodQuarter}</Badge>
        </div>
        {!agg?.released ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Results release when HR opens the period. {agg?.peerCount ? `${agg.peerCount} peer review(s) already in.` : 'No submitted reviews yet.'}
            Reviewer names stay with HR only.
          </p>
        ) : !agg.scores?.length ? (
          <p className="text-xs text-muted-foreground">Released, but no scores yet for this quarter.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-[11px] text-muted-foreground">Based on {agg.peerCount} anonymous peer review(s).</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agg.scores.map((s) => ({ name: s.label.slice(0, 22), score: Number(s.avg) || 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {agg.themes?.length > 0 && (
              <ul className="space-y-2">
                {agg.themes.map((t, i) => (
                  <li key={i} className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    {t.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {acknowledgeTask && (
        <div className="space-y-4">
          <GhcAcknowledgePanel task={acknowledgeTask} onDone={onAcknowledged} embedded />
          {evalRow && (
            <div className="glass-panel p-5 space-y-3">
              <h3 className="text-sm font-semibold">Evaluation discussion</h3>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(discussion?.messages ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No messages yet.</p>
                ) : (
                  discussion?.messages.map((m) => (
                    <div key={m.id} className="rounded-lg border border-border/50 px-3 py-2 text-xs">
                      <p className="font-medium">{m.authorName}</p>
                      <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
              <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder="Continue the conversation…" />
              <Button size="sm" onClick={() => void postMsg()}>Post</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
