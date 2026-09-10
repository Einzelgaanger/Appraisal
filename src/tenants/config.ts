import type { TenantConfig } from './types';

export const EXECUTIVE_TEAM_SUBSIDIARY_ID = '11111111-1111-1111-1111-111111111111';
export const GHC_SUBSIDIARY_ID = '22222222-2222-2222-2222-222222222222';

const boomCapabilities = {
  showDemoRoute: false,
  showRankings: false,
  showGrowthHub: true,
  showLegacyDashboard: false,
  showLegacySurvey: false,
  showAppraisalAdmin: true,
  showEaQuarterlyResults: true,
  showDirectoryInsights: true,
  showComments: true,
  showMonthlyManagerReviews: false,
  showGhcPeer360: false,
  showQuarterlyEvaluation: false,
  showAiAssist: true,
  showEvaluationDiscussions: true,
} as const;

export const TENANTS: TenantConfig[] = [
  {
    slug: 'executiveteam',
    // Production: executive.vgg.app (also appraisal / executiveteam for legacy)
    subdomains: ['executive', 'executiveteam', 'appraisal', 'localhost'],
    subsidiaryId: EXECUTIVE_TEAM_SUBSIDIARY_ID,
    modules: ['appraisal'],
    appraisalMode: 'boom',
    teamMemberMinLevel: 2,
    branding: {
      shortName: 'Executive Team',
      fullName: 'VGG Executive Team',
      workspaceLabel: 'Executive Team BOOM workspace',
    },
    capabilities: { ...boomCapabilities },
  },
  {
    slug: 'ghc',
    subdomains: ['ghc', 'greenhousecapital', 'greenhouse-capital'],
    subsidiaryId: GHC_SUBSIDIARY_ID,
    modules: ['appraisal'],
    appraisalMode: 'ghc',
    teamMemberMinLevel: 4,
    branding: {
      shortName: 'GHC',
      fullName: 'GreenHouse Capital',
      workspaceLabel: 'GreenHouse Capital appraisal',
    },
    capabilities: {
      showDemoRoute: false,
      showRankings: false,
      showGrowthHub: true,
      showLegacyDashboard: false,
      showLegacySurvey: false,
      showAppraisalAdmin: true,
      showEaQuarterlyResults: false,
      showDirectoryInsights: true,
      showComments: false,
      showMonthlyManagerReviews: true,
      showGhcPeer360: true,
      showQuarterlyEvaluation: true,
      showAiAssist: true,
      showEvaluationDiscussions: true,
    },
  },
];

export const DEFAULT_TENANT = TENANTS[0];

function normalizeHostname(hostname: string): string {
  const base = hostname.toLowerCase().split(':')[0];
  if (base === '127.0.0.1') return 'localhost';
  return base;
}

function extractSubdomain(hostname: string): string {
  const normalized = normalizeHostname(hostname);
  const parts = normalized.split('.');
  return parts[0] ?? normalized;
}

export function getTenantBySlug(slug: string | null | undefined): TenantConfig | undefined {
  if (!slug) return undefined;
  return TENANTS.find((tenant) => tenant.slug === slug.trim().toLowerCase());
}

/**
 * Resolve tenant from hostname, then env fallback, then ?tenant= override.
 * Production: executive.vgg.app → EO BOOM; ghc.vgg.app → GHC.
 * Local: ?tenant=ghc or VITE_DEFAULT_TENANT=ghc.
 */
export function resolveTenantFromHostname(hostname: string, search?: string): TenantConfig {
  if (typeof search === 'string' && search.length) {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const fromQuery = getTenantBySlug(params.get('tenant'));
    if (fromQuery) return fromQuery;
  }

  const envSlug = typeof import.meta !== 'undefined'
    ? (import.meta.env?.VITE_DEFAULT_TENANT as string | undefined)
    : undefined;
  const fromEnv = getTenantBySlug(envSlug);

  const subdomain = extractSubdomain(hostname);
  const fromHost = TENANTS.find((tenant) => tenant.subdomains.includes(subdomain));
  if (fromHost) return fromHost;

  return fromEnv ?? DEFAULT_TENANT;
}

export function isBoomTenant(tenant: TenantConfig): boolean {
  return tenant.appraisalMode === 'boom';
}

export function isGhcTenant(tenant: TenantConfig): boolean {
  return tenant.appraisalMode === 'ghc';
}

export function isTenantTeamMember(tenant: TenantConfig, hierarchyLevel: number | null | undefined): boolean {
  return hierarchyLevel != null && hierarchyLevel >= tenant.teamMemberMinLevel;
}
