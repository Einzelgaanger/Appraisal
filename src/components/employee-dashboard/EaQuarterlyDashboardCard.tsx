import { boomScoreBand, type EaQuarterlyResults, type EaQuarterlySubmission } from '@/lib/boomEaQuarterly';

function SubmissionCard({ sub }: { sub: EaQuarterlySubmission }) {
  const scored = (sub.answers ?? []).filter((a) => a.question_type === 'scored' && a.score != null);
  const written = (sub.answers ?? []).filter(
    (a) => (a.question_type === 'written' || a.question_type === 'value_example') && a.text_answer?.trim(),
  );

  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{sub.reviewer_name}</p>
          <p className="text-[11px] text-muted-foreground">
            {sub.reviewer_role ?? 'Manager'} · {sub.period}
            {sub.submitted_at
              ? ` · ${new Date(sub.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
              : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">
            {sub.score_pct != null ? `${sub.score_pct}%` : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {sub.avg_score != null ? `${sub.avg_score}/5 · ${boomScoreBand(sub.avg_score)}` : 'No scores yet'}
          </p>
        </div>
      </div>

      {sub.sections?.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Section averages</p>
          <ul className="space-y-1.5">
            {sub.sections.map((s) => (
              <li
                key={s.section}
                className="flex justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs"
              >
                <span className="text-muted-foreground">{s.section}</span>
                <span className="font-mono font-medium">
                  {s.avg_score}
                  <span className="text-muted-foreground font-normal"> ({s.response_count})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {scored.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Rated items</p>
          <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {scored.map((a, i) => (
              <li key={i} className="rounded-lg border border-border/50 px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-foreground/90 leading-relaxed">{a.question}</span>
                  <span className="font-mono font-semibold shrink-0">{a.score}/5</span>
                </div>
                {a.text_answer?.trim() && (
                  <p className="text-muted-foreground leading-relaxed">{a.text_answer}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {written.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Narrative</p>
          <ul className="space-y-2">
            {written.map((a, i) => (
              <li key={i} className="rounded-lg bg-muted/25 px-3 py-2 text-xs space-y-1">
                <p className="font-medium text-foreground/90">{a.question}</p>
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{a.text_answer}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface EaQuarterlyDashboardCardProps {
  results: EaQuarterlyResults;
}

export default function EaQuarterlyDashboardCard({ results }: EaQuarterlyDashboardCardProps) {
  if (!results.submissions.length) return null;

  const latest = results.submissions[0];
  const overallPct =
    results.submissions.length === 1
      ? latest.score_pct
      : Math.round(
          results.submissions
            .filter((s) => s.score_pct != null)
            .reduce((sum, s) => sum + (s.score_pct ?? 0), 0) /
            Math.max(1, results.submissions.filter((s) => s.score_pct != null).length),
        );

  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold">Executive Office Quarterly Evaluation</h2>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium text-muted-foreground">
              {results.period}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xl">
            Manager evaluation report for this quarter. Scores update automatically when your line manager
            submits. Full discussion thread is also under Appraisal → Discussions.
          </p>
        </div>
        <div className="min-w-[120px] rounded-2xl bg-teal-50 px-4 py-3 text-right">
          <p className="text-sm text-muted-foreground">Quarter score</p>
          <p className="text-3xl font-bold tabular-nums text-primary">
            {overallPct != null && !Number.isNaN(overallPct) ? `${overallPct}%` : '—'}
          </p>
          {latest.avg_score != null && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {latest.avg_score}/5 · {boomScoreBand(latest.avg_score)}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {results.submissions.map((sub) => (
          <SubmissionCard key={sub.response_id} sub={sub} />
        ))}
      </div>
    </div>
  );
}
