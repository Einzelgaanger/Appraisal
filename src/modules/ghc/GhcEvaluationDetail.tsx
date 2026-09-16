import { Badge } from '@/components/ui/badge';
import { GHC_CULTURE_VALUES, GHC_EVAL_INDICATORS, GHC_RATING_BANDS, GHC_SCALE_0_5 } from './ghcConstants';

const scoreField: Record<string, string> = {
  technical: 'score_technical',
  founders_lps: 'score_founders_lps',
  curious: 'score_curious',
  move_fast: 'score_move_fast',
  overachievement: 'score_overachievement',
  job_done: 'score_job_done',
  growth: 'score_growth',
};

const commentField: Record<string, string> = {
  technical: 'comment_technical',
  founders_lps: 'comment_founders_lps',
  curious: 'comment_curious',
  move_fast: 'comment_move_fast',
  overachievement: 'comment_overachievement',
  job_done: 'comment_job_done',
  growth: 'comment_growth',
};

function scaleLabel(value: number | null | undefined) {
  if (value == null) return '—';
  return GHC_SCALE_0_5.find((s) => s.value === value)?.label ?? String(value);
}

type Goal = { area?: string; goal?: string; indicator?: string; timeline?: string; reviewer?: string };

/** Read-only quarterly evaluation narrative for employees and managers. */
export default function GhcEvaluationDetail({
  row,
  title = 'Evaluation detail',
}: {
  row: Record<string, unknown>;
  title?: string;
}) {
  const band =
    GHC_RATING_BANDS.find((b) => b.rating === Number(row.band_rating)) ??
    null;
  const strengths = Array.isArray(row.strengths) ? (row.strengths as string[]) : [];
  const improvements = Array.isArray(row.improvements) ? (row.improvements as string[]) : [];
  const goals = Array.isArray(row.improvement_goals) ? (row.improvement_goals as Goal[]) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary">{String(row.total_score ?? '—')}/35</Badge>
        <Badge variant="outline">{String(row.total_pct ?? '—')}%</Badge>
        <Badge>Band {String(row.band_rating ?? '—')}{band ? ` · ${band.label}` : ''}</Badge>
        <Badge variant="outline" className="text-[10px]">{String(row.status)}</Badge>
      </div>

      <div className="space-y-3">
        {GHC_EVAL_INDICATORS.map((ind) => {
          const score = Number(row[scoreField[ind.key]] ?? 0);
          const comment = String(row[commentField[ind.key]] ?? '');
          return (
            <div key={ind.key} className="rounded-xl border border-border/60 p-3 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">{ind.label}</p>
                <Badge variant="secondary" className="text-[10px]">{score}/5 · {scaleLabel(score)}</Badge>
              </div>
              {comment ? (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{comment}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground/70">No supervisor comment.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold">Areas of strength</p>
          {strengths.filter(Boolean).length === 0 ? (
            <p className="text-[11px] text-muted-foreground">None listed.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {strengths.filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold">Areas of improvement</p>
          {improvements.filter(Boolean).length === 0 ? (
            <p className="text-[11px] text-muted-foreground">None listed.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {improvements.filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold">Improvement goals</p>
        {goals.filter((g) => g.area || g.goal).length === 0 ? (
          <p className="text-[11px] text-muted-foreground">None listed.</p>
        ) : (
          <div className="space-y-2">
            {goals.filter((g) => g.area || g.goal).map((g, i) => (
              <div key={i} className="rounded-lg border border-border/50 px-3 py-2 text-xs space-y-0.5">
                <p className="font-medium">{g.area || 'Goal'}{g.goal ? ` — ${g.goal}` : ''}</p>
                {g.indicator ? <p className="text-muted-foreground">Indicator: {g.indicator}</p> : null}
                {g.timeline ? <p className="text-muted-foreground">Timeline: {g.timeline}</p> : null}
                {g.reviewer ? <p className="text-muted-foreground">Reviewer: {g.reviewer}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Read-only monthly manager review for the direct report. */
export function GhcMonthlyReviewDetail({ row }: { row: Record<string, unknown> }) {
  const yn = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : '—');
  const cultureScores = GHC_CULTURE_VALUES.map((c) => ({
    label: c.label,
    score: Number(row[`culture_${c.key}`] ?? 0),
  }));

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{String(row.period)}</Badge>
        <Badge variant="secondary">{String(row.status)}</Badge>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        {[
          ['Proud this month', yn(row.proud_this_month)],
          ['Personal issues', yn(row.personal_issues)],
          ['Company can help', yn(row.company_can_help)],
          ['Motivated', yn(row.motivated)],
          ['Fulfilled', String(row.fulfilled || '—')],
          ['Time off this quarter', yn(row.time_off_this_quarter)],
          ['Looking forward (personal)', yn(row.looking_forward_personal)],
          ['Looking forward (work)', yn(row.looking_forward_work)],
          ['Meeting OKRs', yn(row.meeting_okrs)],
          ['Displaying growth', yn(row.displaying_growth)],
          ['Strong relationship', yn(row.strong_relationship)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border/50 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {row.motivated_why ? (
        <p><span className="font-medium">Motivation notes:</span> <span className="text-muted-foreground whitespace-pre-wrap">{String(row.motivated_why)}</span></p>
      ) : null}
      {row.fulfilled_how ? (
        <p><span className="font-medium">Fulfilment notes:</span> <span className="text-muted-foreground whitespace-pre-wrap">{String(row.fulfilled_how)}</span></p>
      ) : null}
      {row.policy_feedback ? (
        <p><span className="font-medium">Policy feedback:</span> <span className="text-muted-foreground whitespace-pre-wrap">{String(row.policy_feedback)}</span></p>
      ) : null}
      <div className="space-y-2">
        <p className="font-semibold">Culture ratings</p>
        {cultureScores.map((c) => (
          <div key={c.label} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
            <span className="text-muted-foreground leading-snug">{c.label}</span>
            <Badge variant="secondary" className="shrink-0">{c.score}/5</Badge>
          </div>
        ))}
      </div>
      {row.feedback_to_report ? (
        <p><span className="font-medium">Feedback to you:</span> <span className="text-muted-foreground whitespace-pre-wrap">{String(row.feedback_to_report)}</span></p>
      ) : null}
      {row.feedback_from_report ? (
        <p><span className="font-medium">Your feedback to manager:</span> <span className="text-muted-foreground whitespace-pre-wrap">{String(row.feedback_from_report)}</span></p>
      ) : null}
      {row.additional_comments ? (
        <p><span className="font-medium">Additional comments:</span> <span className="text-muted-foreground whitespace-pre-wrap">{String(row.additional_comments)}</span></p>
      ) : null}
    </div>
  );
}
