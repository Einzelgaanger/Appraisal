/**
 * Legacy VGG survey: higher hierarchy_level = more senior (intern at 0, partner at 8).
 * Executive Office (EO) seed: lower hierarchy_level = more senior (0 = Group CEO).
 * GreenHouse Capital: lower number = more senior (1 = Manager … 3 = Team member).
 * Subsidiary flag `hierarchy_lower_is_senior` selects which convention applies.
 */

import { boomHierarchyLabel } from '@/lib/boomRoleLabels';
import { GHC_SUBSIDIARY_ID, VIGIPAY_SUBSIDIARY_ID } from '@/tenants/config';

/** Legacy pool labels (higher number = more senior in org chart). */
export const LEGACY_HIERARCHY_LABELS: Record<number, string> = {
  0: 'Intern',
  1: 'Junior',
  2: 'Analyst',
  3: 'Associate',
  4: 'Senior Associate',
  5: 'Manager',
  6: 'Principal/Head',
  7: 'C-Suite',
  8: 'Partner',
};

/** Official GHC teams (departments) for profile completion. */
export const GHC_DEPARTMENTS = [
  'Investment',
  'Legal',
  'People Ops',
  'Comms',
  'Operations',
  'Finance',
] as const;

/** Official GHC job titles for profile completion. */
export const GHC_ROLES = [
  'Intern',
  'Analyst',
  'Associate',
  'Senior Associate',
  'Manager',
  'Investment Lead',
  'Finance Lead',
  'People Manager',
  'Head of Legal',
  'Partner',
  'Managing Partner',
] as const;

/**
 * GHC seniority for profile + display.
 * Numeric values stay compatible with the seeded roster (1–4):
 * 1 = Manager, 2 = Line manager, 3+ = Team member.
 */
export const GHC_HIERARCHY_LABELS: Record<number, string> = {
  1: 'Manager',
  2: 'Line manager',
  3: 'Team member',
};

/** Official VigiPay teams from the returned onboarding roster. */
export const VIGIPAY_DEPARTMENTS = [
  'Compliance',
  'Fidesic',
  'Finance',
  'General Manager',
  'Growth',
  'People Operations',
  'Product',
  'Strategy',
  'Technology',
  'Treasury Operations',
] as const;

export function isGhcOrgContext(options?: {
  appraisalMode?: 'boom' | 'ghc' | 'vigipay' | 'legacy';
  subsidiaryId?: string | null;
}): boolean {
  return options?.appraisalMode === 'ghc' || options?.subsidiaryId === GHC_SUBSIDIARY_ID;
}

export function isVigipayOrgContext(options?: {
  appraisalMode?: 'boom' | 'ghc' | 'vigipay' | 'legacy';
  subsidiaryId?: string | null;
}): boolean {
  return options?.appraisalMode === 'vigipay' || options?.subsidiaryId === VIGIPAY_SUBSIDIARY_ID;
}

export function isGhcStyleOrgContext(options?: {
  appraisalMode?: 'boom' | 'ghc' | 'vigipay' | 'legacy';
  subsidiaryId?: string | null;
}): boolean {
  return isGhcOrgContext(options) || isVigipayOrgContext(options);
}

export function displayHierarchyLabel(
  level: number | null | undefined,
  hierarchyLowerIsSenior: boolean,
  options?: { appraisalMode?: 'boom' | 'ghc' | 'vigipay' | 'legacy'; subsidiaryId?: string | null },
): string {
  const l = level ?? 3;

  if (isGhcStyleOrgContext(options)) {
    if (l <= 1) return GHC_HIERARCHY_LABELS[1];
    if (l === 2) return GHC_HIERARCHY_LABELS[2];
    return GHC_HIERARCHY_LABELS[3];
  }
  if (hierarchyLowerIsSenior) return boomHierarchyLabel(level);
  const legacy = LEGACY_HIERARCHY_LABELS[l];
  return legacy ? `L${l} · ${legacy}` : `L${l}`;
}

/** Levels offered on profile completion for a given company / tenant. */
export function hierarchyLevelOptions(options?: {
  appraisalMode?: 'boom' | 'ghc' | 'vigipay' | 'legacy';
  subsidiaryId?: string | null;
}): number[] {
  if (isGhcStyleOrgContext(options)) return [1, 2, 3];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8];
}

/** Feedback direction stored on survey_responses: reviewer vs reviewee seniority. */
export function getSurveyFeedbackDirection(
  reviewerLevel: number,
  revieweeLevel: number,
  hierarchyLowerIsSenior: boolean,
): 'above' | 'peer' | 'below' {
  if (hierarchyLowerIsSenior) {
    if (reviewerLevel < revieweeLevel) return 'above';
    if (reviewerLevel > revieweeLevel) return 'below';
    return 'peer';
  }
  if (reviewerLevel > revieweeLevel) return 'above';
  if (reviewerLevel < revieweeLevel) return 'below';
  return 'peer';
}

export type HierarchyPool = 'above' | 'peers' | 'below';

export function assignHierarchyPool(
  otherLevel: number,
  myLevel: number,
  hierarchyLowerIsSenior: boolean,
): HierarchyPool {
  if (hierarchyLowerIsSenior) {
    if (otherLevel < myLevel) return 'above';
    if (otherLevel > myLevel) return 'below';
    return 'peers';
  }
  if (otherLevel > myLevel) return 'above';
  if (otherLevel < myLevel) return 'below';
  return 'peers';
}
