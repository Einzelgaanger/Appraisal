import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  formatQuarterScore,
  normalizeQuarterScore,
  quarterScoreDetail,
  type QuarterScoreRow,
} from '@/lib/quarterScores';

export default function QuarterScoreHistory({
  activePeriod,
  onSelect,
}: {
  activePeriod: string;
  onSelect: (period: string) => void;
}) {
  const [rows, setRows] = useState<QuarterScoreRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
      }).rpc('get_my_quarter_score_history');
      if (cancelled || error || !Array.isArray(data)) return;
      const next = data
        .map((row) => (row && typeof row === 'object' ? normalizeQuarterScore(row as Record<string, unknown>) : null))
        .filter((row): row is QuarterScoreRow => row != null);
      setRows(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [activePeriod]);

  if (rows.length === 0) return null;

  return (
    <div className="glass-panel mb-6 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Your quarter scores</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Earlier quarters stay here. Open one to see that period’s manager score and peer feedback.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const label = formatQuarterScore(row);
          const detail = quarterScoreDetail(row);
          const selected = row.period === activePeriod;
          return (
            <button
              key={row.period}
              type="button"
              onClick={() => onSelect(row.period)}
              className={`min-w-[8.5rem] rounded-xl border px-3 py-2 text-left transition-colors ${
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border/70 bg-card/40 hover:border-primary/40'
              }`}
            >
              <p className="font-mono text-[10px] text-muted-foreground">{row.period}</p>
              <p className="text-lg font-bold tabular-nums leading-tight">{label.value}</p>
              <p className="text-[10px] text-muted-foreground">{label.caption}</p>
              {detail && <p className="text-[10px] text-muted-foreground">{detail}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
