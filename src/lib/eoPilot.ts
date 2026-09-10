import { DEFAULT_TENANT, EXECUTIVE_TEAM_SUBSIDIARY_ID } from '@/tenants/config';

/** Legacy compatibility exports while tenant-aware routing replaces EO-only checks. */
export const EO_SUBSIDIARY_ID = EXECUTIVE_TEAM_SUBSIDIARY_ID;
export const EO_PILOT_ONLY = DEFAULT_TENANT.appraisalMode === 'boom' && !DEFAULT_TENANT.capabilities.showLegacySurvey;
export const EO_TEAM_MEMBER_MIN_LEVEL = DEFAULT_TENANT.teamMemberMinLevel;

export function isEoTeamMember(hierarchyLevel: number | null | undefined): boolean {
  return hierarchyLevel != null && hierarchyLevel >= EO_TEAM_MEMBER_MIN_LEVEL;
}
