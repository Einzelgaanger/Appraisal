export type QuarterScoreRow = {
  period: string;
  ea_avg: number | null;
  ea_pct: number | null;
  ea_submissions: number;
  peer_avg: number | null;
  peer_reviews: number;
  eval_pct: number | null;
};

export type QuarterScoreLabel = {
  value: string;
  caption: string;
};

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeQuarterScore(raw: Record<string, unknown>): QuarterScoreRow | null {
  const period = typeof raw.period === 'string' ? raw.period : '';
  if (!/^\d{4}-Q[1-4]$/.test(period)) return null;
  return {
    period,
    ea_avg: asNumber(raw.ea_avg),
    ea_pct: asNumber(raw.ea_pct),
    ea_submissions: asNumber(raw.ea_submissions) ?? 0,
    peer_avg: asNumber(raw.peer_avg),
    peer_reviews: asNumber(raw.peer_reviews) ?? 0,
    eval_pct: asNumber(raw.eval_pct),
  };
}

/** The number a person means by "my quarter score": manager evaluation, then company eval, then peer 360. */
export function formatQuarterScore(row: QuarterScoreRow): QuarterScoreLabel {
  if (row.ea_submissions > 0 && row.ea_pct != null) {
    return { value: `${Math.round(row.ea_pct)}%`, caption: 'Manager score' };
  }
  if (row.eval_pct != null) {
    return { value: `${Math.round(row.eval_pct)}%`, caption: 'Evaluation' };
  }
  if (row.peer_reviews > 0 && row.peer_avg != null) {
    return { value: `${row.peer_avg.toFixed(2)}/5`, caption: 'Peer 360' };
  }
  return { value: '—', caption: 'No score yet' };
}

export function quarterScoreDetail(row: QuarterScoreRow): string | null {
  if (row.ea_submissions > 0 && row.ea_pct != null && row.peer_reviews > 0 && row.peer_avg != null) {
    return `Peer 360 ${row.peer_avg.toFixed(2)}/5`;
  }
  if (row.eval_pct != null && row.peer_reviews > 0 && row.peer_avg != null) {
    return `Peer 360 ${row.peer_avg.toFixed(2)}/5`;
  }
  return null;
}
