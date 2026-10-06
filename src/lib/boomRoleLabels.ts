/**
 * Labels for `employees.hierarchy_level` in the Executive Office / BOOM seed model.
 * Lower numbers are more senior in this dataset (0 = Group CEO).
 */
export function boomHierarchyLabel(level: number | null | undefined): string {
  if (level === null || level === undefined) return 'Level not set';
  if (level <= 0) return 'L0 · Top leadership';
  if (level === 1) return 'L1 · Functional lead';
  if (level === 2) return 'L2 · Team';
  return `L${level} · Team member`;
}

/** Short hint for why peer forms may include extra manager-only sections */
export function boomPeerFormHint(level: number | null | undefined): string {
  const l = level ?? 99;
  if (l <= 2) {
    return 'You see manager / executive lens questions on peer reviews.';
  }
  return 'Peer reviews show standard sections; executive-only items are hidden for your role.';
}

/** Intro copy for the BOOM Tasks tab by hierarchy level. */
export function boomTasksIntro(level: number | null | undefined): string {
  if (level != null && level >= 2) {
    return 'Monthly self-reflection and 360 peer reviews for every colleague. If you are a line manager, you will also see Executive Office Quarterly Evaluations for your direct reports.';
  }
  return 'Monthly self and performance self follow role rules; 360 peer reviews include every other active EO colleague. Executive Office Quarterly Evaluations follow your configured line-manager matrix.';
}

/** Human summary for each assessment form type (reviewer-facing). */
export function boomFormPurpose(formCode: string): string {
  switch (formCode) {
    case 'executive':
      return 'Quarterly Executive Performance self-assessment — private reflection about yourself (Uche, Gisele, Omotola, Deyi only).';
    case 'peer_360':
      return '360 Peer review — anonymous feedback on every active EO colleague except yourself.';
    case 'monthly_self':
      return 'Private monthly reflection — only you and authorised admins see answers.';
    case 'ea_quarterly':
      return 'Executive Office Quarterly Evaluation — only assigned line managers see these.';
    case 'epa_gceo_assessor':
      return 'BOOM-EPA v2 GCEO assessor layer — rate L1 functional leads after they submit their executive self-assessment.';
    default:
      return 'Executive Office assessment.';
  }
}
