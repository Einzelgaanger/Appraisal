import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarRange, ClipboardList, FolderKanban, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WorkspacePortalShell from '@/components/WorkspacePortalShell';
import WorkspacePortalEditorial from '@/components/WorkspacePortalEditorial';
import { useTenant } from '@/tenants/TenantContext';
import {
  getApexProductionOrigin,
  isApexHostname,
  isGhcTenant,
  isVigipayTenant,
  PRODUCTION_BASE_DOMAIN,
} from '@/tenants/config';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import { configuredAppraisalQuarter } from '@/lib/boomPeriods';
import type { TenantModule } from '@/tenants/types';

const MODULE_META: Record<
  TenantModule,
  { label: string; blurb: string; icon: React.ComponentType<{ className?: string }> }
> = {
  appraisal: {
    label: 'Performance & 360',
    blurb: 'Reviews, feedback, and cycle results.',
    icon: ClipboardList,
  },
  projects: {
    label: 'Projects & OKRs',
    blurb: 'Delivery tracking and quarterly objectives.',
    icon: FolderKanban,
  },
  leave: {
    label: 'Leave planner',
    blurb: 'Plan and coordinate time off.',
    icon: CalendarRange,
  },
};

function portalAccent(tenantSlug: string): 'executive' | 'ghc' | 'vigipay' {
  if (tenantSlug === 'ghc') return 'ghc';
  if (tenantSlug === 'vigipay') return 'vigipay';
  return 'executive';
}

export default function CompanyWorkspaceEntry() {
  const { tenant } = useTenant();
  const brand = getTenantBrandAssets(tenant);
  const cycle = configuredAppraisalQuarter();
  const ghc = isGhcTenant(tenant);
  const vigipay = isVigipayTenant(tenant);
  const apexLink =
    typeof window !== 'undefined' && !isApexHostname(window.location.hostname)
      ? getApexProductionOrigin()
      : null;

  const loginTo = `/login?tenant=${tenant.slug}`;
  const editorialVariant = vigipay ? 'vigipay' : ghc ? 'ghc' : 'executive';

  return (
    <WorkspacePortalShell
      accent={portalAccent(tenant.slug)}
      mobileHero={
        brand.logoStyle === 'banner' ? (
          <div
            className="workspace-portal-hero-strip flex h-[18vh] min-h-[100px] items-end lg:hidden"
            style={{ backgroundColor: brand.themeColor }}
          >
            <img src={brand.logo} alt="" className="max-h-full w-full object-cover object-left opacity-90" />
          </div>
        ) : undefined
      }
      editorialPanel={
        <WorkspacePortalEditorial
          variant={editorialVariant}
          figure={`Fig. 02 · ${tenant.branding.shortName}`}
          title={`${tenant.branding.fullName} hub`}
          body="Sign in once for performance, projects, and leave — built for your roster and reporting lines, not a generic appraisal form."
        />
      }
      header={
        <header
          className="relative z-[2] flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/50 px-4 py-2.5 backdrop-blur-md sm:px-8"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-md border border-border/60 bg-background/80 p-1 shadow-sm">
              <img src={brand.logoMark} alt={brand.logoAlt} className={`${brand.logoMarkClassName} h-8`} />
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="truncate text-sm font-semibold">{tenant.branding.shortName}</p>
              <p className="font-mono truncate text-[9px] uppercase tracking-wider text-muted-foreground">
                {tenant.branding.fullName}
              </p>
            </div>
          </div>
          {apexLink && (
            <a
              href={apexLink}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-background/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground sm:text-[10px]"
            >
              <ArrowLeft className="h-3 w-3" />
              All companies
            </a>
          )}
        </header>
      }
    >
      <motion.div
        className="mx-auto w-full max-w-md min-h-0"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="workspace-portal-card overflow-hidden p-0">
          <div
            className="px-4 py-3 sm:px-5"
            style={{
              background: `linear-gradient(135deg, ${brand.themeColor}22 0%, transparent 70%)`,
            }}
          >
            {brand.parentCredit && (
              <p className="text-[10px] font-medium text-muted-foreground">{brand.parentCredit}</p>
            )}
            <p className="eyebrow-primary mt-1 text-[10px]">◉ Workspace</p>
            <h1 className="headline-collage display-serif mt-1 text-[clamp(1.45rem,4.5vw,2rem)] font-medium leading-tight">
              {tenant.branding.shortName} <em>hub</em>
            </h1>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              One login for performance, projects, and leave — your full company toolkit.
            </p>
            <p className="mt-2 inline-flex rounded-full border border-border/70 bg-background/70 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Active cycle · {cycle}
            </p>
          </div>

          <ul className="divide-y divide-border/60 border-t border-border/60">
            {tenant.modules.map((m) => {
              const meta = MODULE_META[m];
              const Icon = meta.icon;
              return (
                <li key={m} className="flex items-center gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground">{meta.blurb}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:mt-4">
          <Button variant="green" size="lg" className="h-11 w-full rounded-xl text-sm shadow-md sm:h-12" asChild>
            <Link to={loginTo}>Sign in</Link>
          </Button>
          <Button variant="outline" size="lg" className="h-10 w-full rounded-xl border-border/80 bg-card/60 text-xs backdrop-blur-sm sm:text-sm" asChild>
            <Link to={`/find-account?tenant=${tenant.slug}`}>
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              Find account / reset password
            </Link>
          </Button>
          {apexLink && (
            <p className="text-center text-[10px] text-muted-foreground">
              Wrong company?{' '}
              <a href={apexLink} className="font-medium text-primary hover:underline">
                Back to {PRODUCTION_BASE_DOMAIN}
              </a>
            </p>
          )}
        </div>
      </motion.div>
    </WorkspacePortalShell>
  );
}
