import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WorkspacePortalShell from '@/components/WorkspacePortalShell';
import WorkspacePortalEditorial from '@/components/WorkspacePortalEditorial';
import { useTenant } from '@/tenants/TenantContext';
import {
  getApexProductionOrigin,
  isApexHostname,
  PRODUCTION_BASE_DOMAIN,
} from '@/tenants/config';
import { getTenantBrandAssets, type TenantBrandAssets } from '@/tenants/brandingAssets';
import { configuredAppraisalQuarter } from '@/lib/boomPeriods';

function portalAccent(tenantSlug: string): 'executive' | 'ghc' | 'vigipay' {
  if (tenantSlug === 'ghc') return 'ghc';
  if (tenantSlug === 'vigipay') return 'vigipay';
  return 'executive';
}

function CompanyLogo({ brand, size }: { brand: TenantBrandAssets; size: 'header' | 'hero' }) {
  const hero = size === 'hero';

  if (brand.logoStyle === 'banner') {
    return (
      <img
        src={brand.logo}
        alt={brand.logoAlt}
        className={hero ? 'h-16 w-auto max-w-full object-contain object-left sm:h-[4.75rem]' : 'h-8 w-auto max-w-[14rem] object-contain object-left sm:h-9'}
      />
    );
  }

  if (brand.logoStyle === 'lockup') {
    return (
      <div className="flex items-center gap-2.5">
        <img
          src={brand.logoMark}
          alt=""
          className={hero ? 'h-12 w-12 shrink-0 rounded-md object-contain' : 'h-8 w-8 shrink-0 rounded-md object-contain'}
        />
        <span
          className={
            hero
              ? 'font-display text-[1.85rem] font-semibold leading-none tracking-[-0.02em] text-foreground'
              : 'font-display text-lg font-semibold leading-none tracking-[-0.02em] text-foreground'
          }
        >
          {brand.wordmark}
        </span>
      </div>
    );
  }

  return (
    <img
      src={brand.logo}
      alt={brand.logoAlt}
      className={hero ? 'h-11 w-auto object-contain sm:h-12' : 'h-8 w-auto object-contain'}
    />
  );
}

export default function CompanyWorkspaceEntry() {
  const { tenant } = useTenant();
  const brand = getTenantBrandAssets(tenant);
  const cycle = configuredAppraisalQuarter();
  const apexLink =
    typeof window !== 'undefined' && !isApexHostname(window.location.hostname)
      ? getApexProductionOrigin()
      : null;

  const loginTo = `/login?tenant=${tenant.slug}`;

  return (
    <WorkspacePortalShell
      accent={portalAccent(tenant.slug)}
      editorialPanel={
        <WorkspacePortalEditorial figure="Fig. 02" body="Sign in to continue on this workspace." />
      }
      header={
        <header
          className="relative z-[2] flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/50 px-4 py-2.5 backdrop-blur-md sm:px-8"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <CompanyLogo brand={brand} size="header" />
          {apexLink && (
            <a
              href={apexLink}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-white px-3 py-1.5 text-sm text-muted-foreground ring-1 ring-black/5 hover:text-foreground"
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
        <h1 className="sr-only">{brand.logoAlt}</h1>
        <CompanyLogo brand={brand} size="hero" />
        {brand.parentCredit ? (
          <p className="mt-3 text-[11px] text-muted-foreground">{brand.parentCredit}</p>
        ) : null}
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Sign in to continue.</p>
        <p className="mt-2 text-sm text-muted-foreground">Cycle {cycle}</p>

        <div className="mt-6 flex flex-col gap-2">
          <Button variant="green" size="lg" className="h-11 w-full rounded-2xl bg-teal-500 font-sans text-sm font-medium normal-case tracking-normal text-white shadow-sm hover:bg-teal-600 sm:h-12" asChild>
            <Link to={loginTo}>Sign in</Link>
          </Button>
          <Button variant="outline" size="lg" className="h-11 w-full rounded-2xl border-border/80 bg-card/60 font-sans text-sm font-medium normal-case tracking-normal" asChild>
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
