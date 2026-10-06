import { useEffect, useMemo, useState } from 'react';
import { useQuietLoader } from '@/hooks/useQuietLoader';
import { useSearchParams } from 'react-router-dom';
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
  ghcGetMyEvaluations,
  ghcGetQuarterlyEvaluation,
  ghcListAccessibleEvaluations,
  ghcListReportSelfCheckins,
  ghcListSubmittedMonthlyForMe,
  ghcPostDiscussionMessage,
  type GhcTaskRow,
} from './ghcApi';
import GhcAcknowledgePanel from './GhcAcknowledgePanel';
import GhcEvaluationDetail, { GhcMonthlyReviewDetail } from './GhcEvaluationDetail';
import GhcFeedbackDiscussion from './GhcFeedbackDiscussion';
import { resolveMonthPeriod } from '@/lib/boomPeriods';
import { supabase } from '@/integrations/supabase/client';

const CHECKIN_COMMENT_LABELS: Record<string, string> = {
  time_off_this_quarter: 'Time off',
  looking_forward_personal: 'Looking forward (personal)',
  looking_forward_work: 'Looking forward (work)',
  meeting_okrs: 'Meeting OKRs',
  displaying_growth: 'Growth',
  strong_relationship: 'Relationship with manager',
  proud_this_month: 'Proud this month',
  personal_issues: 'Personal issues',
  company_can_help: 'Company can help',
  motivated: 'Motivation',
  fulfilled: 'Fulfilment',
};

function commentLines(raw: unknown) {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => ({ key, label: CHECKIN_COMMENT_LABELS[key] ?? key, text: String(value ?? '').trim() }))
    .filter((row) => row.text);
}
import QuarterScoreHistory from '@/components/employee-dashboard/QuarterScoreHistory';

export default function GhcMyResults({
  periodQuarter,
  acknowledgeTask,
  onAcknowledged,
  onPeriodChange,
}: {
  periodQuarter: string;
  acknowledgeTask: GhcTaskRow | null;
  onAcknowledged: () => void;
  onPeriodChange?: (period: string) => void;
}) {
  const [searchParams] = useSearchParams();
  const periodMonth = resolveMonthPeriod(searchParams.get('ghcMonth'));
  const deepEvalId = searchParams.get('ghcEval');

  const [loading, setLoading] = useState(true);
  const { start: startLoading, finish: finishLoading } = useQuietLoader(setLoading);
  const [meId, setMeId] = useState<string | null>(null);
  const [agg, setAgg] = useState<{
    released: boolean;
    peerCount: number;
    scores: Array<{ key: string; label: string; avg: number }>;
    themes: Array<{ text: string }>;
  } | null>(null);
  const [evals, setEvals] = useState<Array<{
    id: string;
    period: string;
    status: string;
    total_score: number | null;
    total_pct: number | null;
    band_rating: number | null;
    manager_name: string | null;
  }>>([]);
  const [accessible, setAccessible] = useState<Array<{
    id: string;
    period: string;
    status: string;
    total_score: number | null;
    total_pct: number | null;
    band_rating: number | null;
    employee_id: string;
    manager_id: string;
  }>>([]);
  const [monthlyRows, setMonthlyRows] = useState<Array<Record<string, unknown>>>([]);
  const [selfCheckins, setSelfCheckins] = useState<Array<Record<string, unknown>>>([]);
  const [activeEvalId, setActiveEvalId] = useState<string | null>(null);
  const [evalRow, setEvalRow] = useState<Record<string, unknown> | null>(null);
  const [discussion, setDiscussion] = useState<{ messages: Array<{ id: string; authorName: string; body: string; createdAt: string }> } | null>(null);
  const [msg, setMsg] = useState('');
  const [activeMonthlyId, setActiveMonthlyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      startLoading();
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: me } = await (supabase as any).rpc('ghc_me');
        const [data, myEvals, monthly, accessibleEvals, reportSelf] = await Promise.all([
          ghcGetMy360Aggregate(periodQuarter),
          ghcGetMyEvaluations(periodQuarter).catch(() => []),
          ghcListSubmittedMonthlyForMe(periodMonth).catch(() => []),
          ghcListAccessibleEvaluations(periodQuarter).catch(() => []),
          ghcListReportSelfCheckins(periodMonth).catch(() => []),
        ]);
        if (cancelled) return;
        setMeId(typeof me === 'string' ? me : me ?? null);
        setAgg(data);
        setEvals(myEvals);
        setMonthlyRows(monthly);
        setSelfCheckins(reportSelf);
        setAccessible(accessibleEvals);
        const preferred =
          acknowledgeTask?.record_id ||
          deepEvalId ||
          myEvals[0]?.id ||
          accessibleEvals.find((e) => e.manager_id === me)?.id ||
          null;
        if (preferred) setActiveEvalId(preferred);
        if (monthly[0]?.id) setActiveMonthlyId(String(monthly[0].id));
      } catch {
        if (!cancelled) {
          setAgg(null);
          setEvals([]);
          setMonthlyRows([]);
          setAccessible([]);
        }
      } finally {
        if (!cancelled) finishLoading();
      }
    })();
    return () => { cancelled = true; };
  }, [acknowledgeTask?.record_id, deepEvalId, finishLoading, periodMonth, periodQuarter, startLoading]);

  useEffect(() => {
    const id = acknowledgeTask?.record_id || activeEvalId;
    if (!id) {
      setEvalRow(null);
      setDiscussion(null);
      return;
    }
    void ghcGetQuarterlyEvaluation(id).then(async (row) => {
      setEvalRow(row);
      if (row?.id) {
        const d = await ghcGetDiscussion(row.id).catch(() => null);
        setDiscussion({ messages: d?.messages ?? [] });
      }
    });
  }, [acknowledgeTask?.record_id, activeEvalId]);

  const managedEvals = useMemo(
    () => accessible.filter((e) => meId && e.manager_id === meId && !evals.some((mine) => mine.id === e.id)),
    [accessible, meId, evals],
  );

  const receivedMonthly = useMemo(
    () => monthlyRows.filter((r) => meId && r.report_id === meId),
    [monthlyRows, meId],
  );

  const activeMonthly = receivedMonthly.find((r) => String(r.id) === activeMonthlyId) ?? receivedMonthly[0] ?? null;

  const postMsg = async () => {
    const id = acknowledgeTask?.record_id || activeEvalId;
    if (!id || !msg.trim()) return;
    try {
      await ghcPostDiscussionMessage(id, msg.trim());
      setMsg('');
      const d = await ghcGetDiscussion(id);
      setDiscussion({ messages: d?.messages ?? [] });
      toast.success('Message posted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post');
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        {onPeriodChange && (
          <QuarterScoreHistory activePeriod={periodQuarter} onSelect={onPeriodChange} />
        )}
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
        </div>
      </div>
    );
  }

  const ackTask: GhcTaskRow | null =
    acknowledgeTask ||
    (evals.find((e) => e.status === 'submitted')
      ? {
          kind: 'acknowledge_evaluation',
          title: 'Acknowledge quarterly evaluation',
          subject_id: '',
          subject_name: 'You',
          subject_role: null,
          period: evals.find((e) => e.status === 'submitted')!.period,
          status: 'submitted',
          record_id: evals.find((e) => e.status === 'submitted')!.id,
        }
      : null);

  const viewingOwnEval = Boolean(
    evalRow && meId && (evalRow.employee_id === meId || evals.some((e) => e.id === evalRow.id)),
  );

  return (
    <div className="space-y-5">
      {onPeriodChange && (
        <QuarterScoreHistory activePeriod={periodQuarter} onSelect={onPeriodChange} />
      )}
      <div className="glass-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold">Anonymous peer 360</h3>
          <Badge variant="outline" className="text-[10px]">{periodQuarter}</Badge>
        </div>
        {!agg?.scores?.length ? (
          <p className="text-xs text-muted-foreground">
            No scores yet for this quarter.
            {agg?.peerCount ? ` ${agg.peerCount} peer review(s) are in, and scores appear here for everyone at the same time.` : ' Anonymous scores appear here for everyone as soon as peers submit.'}
            {' '}Reviewer names stay with People Ops only.
          </p>
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
        {meId && (
          <div className="mt-4">
            <GhcFeedbackDiscussion
              kind="peer_360"
              subjectId={meId}
              period={periodQuarter}
              title="360 discussion with your manager"
            />
          </div>
        )}
      </div>

      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold">Team monthly self check-ins ({periodMonth})</h3>
        <p className="text-[11px] text-muted-foreground">
          Submitted check-ins from people you manage (and Bunmi / HR can see all). Open a row to chat.
        </p>
        {selfCheckins.length === 0 ? (
          <p className="text-xs text-muted-foreground">No submitted self check-ins visible for this month yet.</p>
        ) : (
          <div className="space-y-4">
            {selfCheckins.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-border/50 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{String(row.employee_name)}</span>
                  <Badge variant="outline" className="text-[10px]">{String(row.status)}</Badge>
                </div>
                <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>Time off: {row.time_off_this_quarter == null ? '—' : row.time_off_this_quarter ? 'Yes' : 'No'}</div>
                  <div>Meeting OKRs: {row.meeting_okrs == null ? '—' : row.meeting_okrs ? 'Yes' : 'No'}</div>
                  <div>Growth: {row.displaying_growth == null ? '—' : row.displaying_growth ? 'Yes' : 'No'}</div>
                  <div>Strong relationship: {row.strong_relationship == null ? '—' : row.strong_relationship ? 'Yes' : 'No'}</div>
                </dl>
                {row.policy_feedback ? (
                  <p className="text-xs whitespace-pre-wrap">{String(row.policy_feedback)}</p>
                ) : null}
                {commentLines(row.question_comments).map((item) => (
                  <p key={item.key} className="text-xs whitespace-pre-wrap">
                    <span className="font-medium">{item.label}: </span>
                    <span className="text-muted-foreground">{item.text}</span>
                  </p>
                ))}
                <GhcFeedbackDiscussion
                  kind="monthly_self"
                  subjectId={String(row.employee_id)}
                  period={periodMonth}
                  title={`Chat with ${String(row.employee_name)}`}
                />
              </div>
            ))}
          </div>
        )}
        {meId && (
          <GhcFeedbackDiscussion
            kind="monthly_self"
            subjectId={meId}
            period={periodMonth}
            title="Your self check-in discussion with your manager"
          />
        )}
      </div>

      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold">Monthly reviews received ({periodMonth})</h3>
        {receivedMonthly.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No submitted monthly manager review for you this month yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {receivedMonthly.map((row) => (
                <Button
                  key={String(row.id)}
                  size="sm"
                  variant={String(row.id) === String(activeMonthly?.id) ? 'default' : 'outline'}
                  className="h-8 text-xs"
                  onClick={() => setActiveMonthlyId(String(row.id))}
                >
                  Review · {String(row.period)}
                </Button>
              ))}
            </div>
            {activeMonthly ? (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
                <GhcMonthlyReviewDetail row={activeMonthly} />
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold">Your quarterly evaluation</h3>
        {evals.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No submitted evaluation for {periodQuarter} yet. After your manager submits, you will acknowledge it here.
          </p>
        ) : (
          <div className="space-y-2">
            {evals.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setActiveEvalId(ev.id)}
                className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                  (acknowledgeTask?.record_id || activeEvalId) === ev.id ? 'border-primary bg-primary/5' : 'border-border/50'
                }`}
              >
                <span className="font-medium">{ev.manager_name ?? 'Manager'}</span>
                <Badge variant="outline" className="text-[10px]">{ev.status}</Badge>
                <Badge variant="secondary" className="text-[10px]">{ev.total_score ?? '—'}/35 · {ev.total_pct ?? '—'}%</Badge>
                <Badge className="text-[10px]">Band {ev.band_rating ?? '—'}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {managedEvals.length > 0 && (
        <div className="glass-panel p-5 space-y-3">
          <h3 className="text-sm font-semibold">Reports — evaluations & discussion</h3>
          <p className="text-[11px] text-muted-foreground">
            Open a submitted evaluation for someone you manage to review the write-up and continue the discussion thread.
          </p>
          <div className="space-y-2">
            {managedEvals.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setActiveEvalId(ev.id)}
                className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                  activeEvalId === ev.id ? 'border-primary bg-primary/5' : 'border-border/50'
                }`}
              >
                <span className="font-medium">Report eval</span>
                <Badge variant="outline" className="text-[10px]">{ev.status}</Badge>
                <Badge variant="secondary" className="text-[10px]">{ev.total_score ?? '—'}/35</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {evalRow && (
        <div className="glass-panel p-5">
          <GhcEvaluationDetail
            row={evalRow}
            title={viewingOwnEval ? 'Your evaluation detail' : 'Report evaluation detail'}
          />
        </div>
      )}

      {ackTask && viewingOwnEval && (
        <GhcAcknowledgePanel task={ackTask} onDone={onAcknowledged} embedded />
      )}

      {evalRow && (
        <div className="glass-panel p-5 space-y-3">
          <h3 className="text-sm font-semibold">Evaluation discussion</h3>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {(discussion?.messages ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No messages yet. Start the thread after acknowledgement opens.</p>
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
  );
}
