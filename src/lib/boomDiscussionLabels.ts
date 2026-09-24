export const BOOM_OVERSIGHT_EMAILS = [
  'bunmi.akinyemiju@peopleos.co',
  'omotola.akinyemiju@venturegardengroup.com',
  'uche.ukonu@venturegardengroup.com',
  'gisele.karakezi@venturegardengroup.com',
  'deyi.dipeolu@venturegardengroup.com',
] as const;

/** L0/L1 can open the peer-360 oversight roster (scoped server-side by pod). */
export function canViewPeer360Oversight(
  hierarchyLevel: number | null | undefined,
  isAdmin?: boolean,
): boolean {
  if (isAdmin) return true;
  if (hierarchyLevel === null || hierarchyLevel === undefined) return false;
  return hierarchyLevel <= 1;
}

/** @deprecated Prefer canViewPeer360Oversight(hierarchyLevel) */
export function isBoomOversightViewer(
  email: string | null | undefined,
  hierarchyLevel?: number | null,
): boolean {
  if (canViewPeer360Oversight(hierarchyLevel)) return true;
  if (!email) return false;
  const e = email.toLowerCase();
  return BOOM_OVERSIGHT_EMAILS.some((x) => x.toLowerCase() === e);
}

export const DISCUSSION_FORM_LABELS: Record<string, string> = {
  monthly_self: 'Monthly self check-in',
  executive: 'Executive assessment',
  ea_quarterly: 'EA quarterly evaluation',
  peer_360: '360 peer review (chat with manager)',
};

export function discussionThreadTitle(
  formCode: string,
  viewerRole: 'subject' | 'facilitator',
  subjectName: string,
  facilitatorName: string,
): string {
  const label = DISCUSSION_FORM_LABELS[formCode] ?? formCode;
  if (formCode === 'peer_360' && viewerRole === 'subject') {
    return `${label} · anonymous results`;
  }
  if (viewerRole === 'subject') {
    return `${label} · with ${facilitatorName}`;
  }
  return `${label} · ${subjectName}`;
}
