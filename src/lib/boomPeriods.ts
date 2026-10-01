const QUARTER_KEY = /^\d{4}-Q[1-4]$/;

/** Active appraisal cycle (all tenants). Override via VITE_ACTIVE_APPRAISAL_QUARTER e.g. `2026-Q3`. */
export function configuredAppraisalQuarter(): string | null {
  const raw = (import.meta.env.VITE_ACTIVE_APPRAISAL_QUARTER as string | undefined)?.trim();
  if (raw && QUARTER_KEY.test(raw)) return raw;
  // End-of-Q3 launch default when env is not set (calendar would show Q4 in Oct).
  return '2026-Q3';
}

/** Calendar month key e.g. `2026-05` for BOOM monthly self-assessment. */
export function defaultMonthPeriod(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Fiscal quarter label e.g. `2026-Q1` for quarterly BOOM forms. */
export function defaultQuarterPeriod(d = new Date()): string {
  const configured = configuredAppraisalQuarter();
  if (configured) return configured;
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/** Resolve a quarter from URL/storage; falls back to the active appraisal quarter if invalid. */
export function resolveQuarterPeriod(value: string | null | undefined, d = new Date()): string {
  const opts = quarterOptions(4, 1, d);
  const configured = configuredAppraisalQuarter();
  if (value && (opts.includes(value) || value === configured)) return value;
  return defaultQuarterPeriod(d);
}

/** Resolve a month key; falls back to current month if invalid. */
export function resolveMonthPeriod(value: string | null | undefined, d = new Date()): string {
  const opts = monthOptions(6, 1, d);
  if (value && opts.includes(value)) return value;
  return defaultMonthPeriod(d);
}

export function quarterOptions(countPast = 4, countFuture = 1, d = new Date()): string[] {
  const out: string[] = [];
  const centerYear = d.getFullYear();
  const centerQ = Math.floor(d.getMonth() / 3) + 1;
  let y = centerYear;
  let q = centerQ;
  for (let i = 0; i < countPast; i++) {
    out.unshift(`${y}-Q${q}`);
    q--;
    if (q < 1) {
      q = 4;
      y--;
    }
  }
  y = centerYear;
  q = centerQ;
  const forward: string[] = [];
  for (let i = 0; i < countFuture; i++) {
    q++;
    if (q > 4) {
      q = 1;
      y++;
    }
    forward.push(`${y}-Q${q}`);
  }
  return [...new Set([...out, ...forward])];
}

export function monthOptions(monthsBack = 6, monthsAhead = 1, d = new Date()): string[] {
  const out: string[] = [];
  const cur = new Date(d.getFullYear(), d.getMonth(), 1);
  for (let i = monthsBack; i >= 0; i--) {
    const dt = new Date(cur.getFullYear(), cur.getMonth() - i, 1);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  for (let i = 1; i <= monthsAhead; i++) {
    const dt = new Date(cur.getFullYear(), cur.getMonth() + i, 1);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
