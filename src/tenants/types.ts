export type TenantModule = 'appraisal';

export type AppraisalMode = 'boom' | 'ghc' | 'legacy';

export interface TenantCapabilities {
  showDemoRoute: boolean;
  showRankings: boolean;
  showGrowthHub: boolean;
  showLegacyDashboard: boolean;
  showLegacySurvey: boolean;
  showAppraisalAdmin: boolean;
  showEaQuarterlyResults: boolean;
  showDirectoryInsights: boolean;
  showComments: boolean;
  /** GHC monthly manager–direct report reviews */
  showMonthlyManagerReviews: boolean;
  /** GHC quarterly peer 360 */
  showGhcPeer360: boolean;
  /** GHC formal quarterly evaluation + partner actions */
  showQuarterlyEvaluation: boolean;
  /** AI draft assist for managers / HR */
  showAiAssist: boolean;
  /** Post-release evaluation discussion threads */
  showEvaluationDiscussions: boolean;
}

export interface TenantBranding {
  shortName: string;
  fullName: string;
  workspaceLabel: string;
}

export interface TenantConfig {
  slug: string;
  subdomains: string[];
  subsidiaryId: string | null;
  modules: TenantModule[];
  appraisalMode: AppraisalMode;
  teamMemberMinLevel: number;
  branding: TenantBranding;
  capabilities: TenantCapabilities;
}
