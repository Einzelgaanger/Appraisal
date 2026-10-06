import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import vggLogo from '@/assets/vgg-logo.webp';
import WorkspacePortalShell from '@/components/WorkspacePortalShell';
import WorkspacePortalEditorial, { WorkspacePortalGallery } from '@/components/WorkspacePortalEditorial';
import {
  getApexProductionOrigin,
  getTenantEntryUrl,
  getTenantProductionHost,
  PRODUCTION_BASE_DOMAIN,
  TENANTS,
} from '@/tenants/config';
import { getTenantBrandAssets, type TenantBrandAssets } from '@/tenants/brandingAssets';
import type { TenantConfig } from '@/tenants/types';

function CompanyLockup({
  tenant,
  brand,
  host,
}: {
  tenant: TenantConfig;
  brand: TenantBrandAssets;
  host: string;
}) {
  return (
    <div className="min-w-0">
      {brand.logoStyle === 'banner' ? (
        <img
          src={brand.logo}
          alt={brand.logoAlt}
          className="h-14 w-auto max-w-full object-contain object-left sm:h-16"
        />
      ) : brand.logoStyle === 'lockup' ? (
        <div className="flex items-center gap-3">
          <img src={brand.logoMark} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
          <span className="font-display text-[1.65rem] font-semibold leading-none tracking-[-0.02em] text-foreground">
            {brand.wordmark}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <img src={brand.logo} alt={brand.logoAlt} className="h-9 w-auto object-contain sm:h-10" />
          <span className="font-display text-lg font-medium leading-none tracking-tight text-foreground">
            {tenant.branding.shortName}
          </span>
        </div>
      )}
      <p className="mt-2 text-sm text-muted-foreground">{host}</p>
    </div>
  );
}

export default function VggWorkspacePortal() {
  const apexOrigin = getApexProductionOrigin();

  return (
    <WorkspacePortalShell
      accent="apex"
      mobileHero={
        <div className="workspace-portal-hero-strip relative h-[20vh] min-h-[120px] lg:hidden">
          <WorkspacePortalGallery />
        </div>
      }
      editorialPanel={
        <WorkspacePortalEditorial
          title="Where your company works"
          body="Each company keeps its own workspace on a dedicated host. Pick one to continue on that site."
        />
      }
      header={
        <header
          className="relative z-[2] flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/50 px-4 py-2.5 backdrop-blur-md sm:px-8"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <img src={vggLogo} alt="Venture Garden Group" className="h-7 w-auto sm:h-8" />
            <div className="hidden h-6 w-px bg-border sm:block" />
            <div className="hidden sm:block">
              <p className="text-sm text-muted-foreground">{PRODUCTION_BASE_DOMAIN}</p>
              <p className="text-sm font-medium text-foreground/90">Group portal</p>
            </div>
          </div>
        </header>
      }
      footer={
        <footer
          className="relative z-[2] shrink-0 border-t border-border/60 bg-card/40 px-4 py-2 text-center backdrop-blur-md"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <span className="text-sm text-muted-foreground">
            © Venture Garden Group ·{' '}
            <a href={apexOrigin} className="text-primary/90 hover:text-primary">
              {PRODUCTION_BASE_DOMAIN}
            </a>
          </span>
        </footer>
      }
    >
      <motion.div
        className="mx-auto flex w-full max-w-xl min-h-0 flex-col gap-3 sm:gap-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div>
          <h1 className="headline-collage display-serif text-[clamp(1.5rem,4.5vw,2.35rem)] font-medium leading-[1.02] tracking-tight">
            Choose your <em>company</em>
          </h1>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Open the workspace that matches where you work, then sign in there.
          </p>
        </div>

        <ul className="divide-y divide-border/70">
          {TENANTS.map((tenant, i) => {
            const brand = getTenantBrandAssets(tenant);
            const host = getTenantProductionHost(tenant);
            const entryUrl = getTenantEntryUrl(tenant);
            return (
              <motion.li
                key={tenant.slug}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i, duration: 0.4 }}
              >
                <a
                  href={entryUrl}
                  aria-label={`${tenant.branding.fullName} — ${host}`}
                  className="group flex items-center gap-4 py-3.5 sm:py-4"
                >
                  <div className="min-w-0 flex-1">
                    <CompanyLockup tenant={tenant} brand={brand} host={host} />
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </a>
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    </WorkspacePortalShell>
  );
}
