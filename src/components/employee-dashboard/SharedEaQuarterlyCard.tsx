import { Button } from '@/components/ui/button';
import type { SharedEaQuarterlyRow } from '@/lib/boomEaQuarterly';

interface SharedEaQuarterlyCardProps {
  rows: SharedEaQuarterlyRow[];
  period: string;
  onOpen: (row: SharedEaQuarterlyRow) => void;
}

export default function SharedEaQuarterlyCard({ rows, period, onOpen }: SharedEaQuarterlyCardProps) {
  if (!rows.length) return null;

  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Quarterly evaluations you share</h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium text-muted-foreground">
            {period}
          </span>
        </div>
        <p className="max-w-xl text-[11px] leading-relaxed text-muted-foreground">
          One evaluation per person each quarter. If another assigned manager already submitted it, open that
          appraisal. You can view it, and it is not filed again.
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => {
          const submitted = row.status === 'submitted';
          return (
            <li
              key={row.reviewee_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{row.reviewee_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {row.reviewee_role ?? 'Report'}
                  {submitted && row.reviewer_name ? ` · Submitted by ${row.reviewer_name}` : ' · Not submitted yet'}
                  {submitted && row.score_pct != null ? ` · ${row.score_pct}%` : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={submitted ? 'outline' : 'default'}
                className="h-8 rounded-xl"
                onClick={() => onOpen(row)}
              >
                {submitted ? 'View' : 'Start'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
