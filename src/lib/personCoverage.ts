/** Teams and titles a person actually covers. One primary, plus any others. */

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function coverageLabels(primary: string | null | undefined, extra?: string[] | null): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const text = (value ?? '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(text);
  };
  push(primary);
  for (const item of extra ?? []) push(item);
  return labels;
}

export function formatTeams(primary: string | null | undefined, extra?: string[] | null, empty = 'Unassigned'): string {
  const labels = coverageLabels(primary, extra);
  return labels.length ? labels.join(' & ') : empty;
}

export function formatRoles(primary: string | null | undefined, extra?: string[] | null, empty = 'Employee'): string {
  const labels = coverageLabels(primary, extra);
  return labels.length ? labels.join(' · ') : empty;
}

/** Drop the primary label out of an extra list, case-insensitively. */
export function extrasExcept(primary: string | null | undefined, extra: string[]): string[] {
  const key = (primary ?? '').trim().toLowerCase();
  return coverageLabels(null, extra).filter((label) => label.toLowerCase() !== key);
}
