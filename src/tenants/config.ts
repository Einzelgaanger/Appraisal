import type { TenantConfig } from './types';

export const EXECUTIVE_TEAM_SUBSIDIARY_ID = '11111111-1111-1111-1111-111111111111';
export const GHC_SUBSIDIARY_ID = '22222222-2222-2222-2222-222222222222';
export const VIGIPAY_SUBSIDIARY_ID = '33333333-3333-3333-3333-333333333333';

/** Apex domain for production tenant hosts */
export const PRODUCTION_BASE_DOMAIN = 'vgg.tools';

/** Canonical public hosts (Render custom domains) */
export const PRODUCTION_TENANT_HOSTS = {
  executiveteam: `executive.${PRODUCTION_BASE_DOMAIN}`,
  ghc: `ghc.${PRODUCTION_BASE_DOMAIN}`,
  vigipay: `vigipay.${PRODUCTION_BASE_DOMAIN}`,
} as const;

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
    // Production: executive.vgg.tools (legacy: *.vgg.app / appraisal)
    subdomains: ['executive', 'executiveteam', 'appraisal'],
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
    teamMemberMinLevel: 3,
    branding: {
      shortName: 'GHC',
      fullName: 'GreenHouse Capital',
      workspaceLabel: 'GreenHouse Capital workspace',
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
  {
    slug: 'vigipay',
    subdomains: ['vigipay'],
    subsidiaryId: VIGIPAY_SUBSIDIARY_ID,
    modules: ['appraisal'],
    appraisalMode: 'vigipay',
    teamMemberMinLevel: 3,
    branding: {
      shortName: 'VigiPay',
      fullName: 'VigiPay',
      workspaceLabel: 'VigiPay appraisal workspace',
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
  // executive.vgg.tools → executive ; ghc.vgg.app → ghc
  return parts[0] ?? normalized;
}

export function getTenantBySlug(slug: string | null | undefined): TenantConfig | undefined {
  if (!slug) return undefined;
  return TENANTS.find((tenant) => tenant.slug === slug.trim().toLowerCase());
}

export function getTenantBySubsidiaryId(subsidiaryId: string | null | undefined): TenantConfig | undefined {
  if (!subsidiaryId) return undefined;
  return TENANTS.find((tenant) => tenant.subsidiaryId === subsidiaryId);
}

export function getTenantProductionHost(tenant: TenantConfig): string {
  const mapped = PRODUCTION_TENANT_HOSTS[tenant.slug as keyof typeof PRODUCTION_TENANT_HOSTS];
  return mapped ?? PRODUCTION_TENANT_HOSTS.executiveteam;
}

export function getTenantProductionOrigin(tenant: TenantConfig): string {
  return `https://${getTenantProductionHost(tenant)}`;
}

/**
 * Resolve tenant from (in order):
 * 1. Locked user → home tenant (never email domain)
 * 2. ?tenant= query override
 * 3. Hostname subdomain (executive.vgg.tools / ghc.vgg.tools / vigipay.vgg.tools)
 * 4. Signed-in profile subsidiary
 * 5. VITE_DEFAULT_TENANT
 * 6. Executive Team default
 */
export function resolveTenantFromHostname(
  hostname: string,
  search?: string,
  options?: { subsidiaryId?: string | null; lockedTenantSlug?: string | null },
): TenantConfig {
  const locked = getTenantBySlug(options?.lockedTenantSlug);
  if (locked) return locked;

  if (typeof search === 'string' && search.length) {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const fromQuery = getTenantBySlug(params.get('tenant'));
    if (fromQuery) return fromQuery;
  }

  const subdomain = extractSubdomain(hostname);
  const fromHost = TENANTS.find((tenant) => tenant.subdomains.includes(subdomain));
  if (fromHost) return fromHost;

  const fromSubsidiary = getTenantBySubsidiaryId(options?.subsidiaryId);
  if (fromSubsidiary) return fromSubsidiary;

  const envSlug = typeof import.meta !== 'undefined'
    ? (import.meta.env?.VITE_DEFAULT_TENANT as string | undefined)
    : undefined;
  const fromEnv = getTenantBySlug(envSlug);
  return fromEnv ?? DEFAULT_TENANT;
}

export function isBoomTenant(tenant: TenantConfig): boolean {
  return tenant.appraisalMode === 'boom';
}

export function isGhcTenant(tenant: TenantConfig): boolean {
  return tenant.appraisalMode === 'ghc';
}

export function isVigipayTenant(tenant: TenantConfig): boolean {
  return tenant.appraisalMode === 'vigipay';
}

/** GHC instruments (monthly / 360 / quarterly eval) — used by GHC and VigiPay until VigiPay specs land. */
export function isGhcStyleAppraisal(tenant: TenantConfig): boolean {
  return tenant.appraisalMode === 'ghc' || tenant.appraisalMode === 'vigipay';
}

export function isTenantTeamMember(tenant: TenantConfig, hierarchyLevel: number | null | undefined): boolean {
  return hierarchyLevel != null && hierarchyLevel >= tenant.teamMemberMinLevel;
}
