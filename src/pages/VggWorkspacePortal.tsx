import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarRange, ClipboardList, FolderKanban } from 'lucide-react';
import vggLogo from '@/assets/vgg-logo.webp';
import heroHub from '@/assets/hero-hub.jpg';
import WorkspacePortalShell from '@/components/WorkspacePortalShell';
import WorkspacePortalEditorial from '@/components/WorkspacePortalEditorial';
import {
  getApexProductionOrigin,
  getTenantEntryUrl,
  getTenantProductionHost,
  PRODUCTION_BASE_DOMAIN,
  TENANTS,
} from '@/tenants/config';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import { configuredAppraisalQuarter } from '@/lib/boomPeriods';
import type { TenantConfig, TenantModule } from '@/tenants/types';

const MODULE_META: Record<TenantModule, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  appraisal: { label: 'Performance', icon: ClipboardList },
  projects: { label: 'Projects', icon: FolderKanban },
  leave: { label: 'Leave', icon: CalendarRange },
};

const CARD_ACCENT: Record<string, string> = {
  executiveteam: 'from-emerald-600 to-emerald-900',
  ghc: 'from-teal-600 to-teal-950',
  vigipay: 'from-cyan-700 to-slate-900',
};

function moduleLabels(tenant: TenantConfig): string {
  return tenant.modules.map((m) => MODULE_META[m].label).join(' · ');
}

export default function VggWorkspacePortal() {
  const cycle = configuredAppraisalQuarter();
  const apexOrigin = getApexProductionOrigin();

  return (
    <WorkspacePortalShell
      accent="apex"
      mobileHero={
        <div className="workspace-portal-hero-strip h-[20vh] min-h-[120px] lg:hidden">
          <img src={heroHub} alt="" />
        </div>
      }
      editorialPanel={
        <WorkspacePortalEditorial
          variant="apex"
          figure="Fig. 01"
          title="Where your company works"
          body="Each subsidiary runs its own workspace — performance cycles, project tracking, and leave — on a dedicated host. Pick a card to continue on that site."
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
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {PRODUCTION_BASE_DOMAIN}
              </p>
              <p className="text-[11px] font-medium text-foreground/90">Group workspace portal</p>
            </div>
          </div>
          <Link
            to="/docs"
            className="rounded-md border border-border/70 bg-background/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-primary/30 hover:text-foreground"
          >
            Docs
          </Link>
        </header>
      }
      footer={
        <footer
          className="relative z-[2] shrink-0 border-t border-border/60 bg-card/40 px-4 py-2 text-center backdrop-blur-md"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[10px]">
            © Venture Garden Group · Cycle {cycle} ·{' '}
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
          <div className="flex items-center gap-2">
            <span className="eyebrow-primary text-[10px] sm:text-xs">◉ VGG workspace</span>
            <span className="hidden h-px flex-1 bg-border sm:block" />
            <span className="hidden font-mono text-[9px] uppercase tracking-wider text-muted-foreground sm:inline">
              {cycle}
            </span>
          </div>
          <h1 className="headline-collage display-serif mt-2 text-[clamp(1.5rem,4.5vw,2.35rem)] font-medium leading-[1.02] tracking-tight">
            Choose your <em>company</em>
          </h1>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Performance, projects, and leave — open the workspace that matches where you work, then sign in there.
          </p>
        </div>

        <ul className="grid min-h-0 grid-cols-3 gap-1.5 sm:gap-3">
          {TENANTS.map((tenant, i) => {
            const brand = getTenantBrandAssets(tenant);
            const host = getTenantProductionHost(tenant);
            const entryUrl = getTenantEntryUrl(tenant);
            const grad = CARD_ACCENT[tenant.slug] ?? CARD_ACCENT.executiveteam;
            return (
              <motion.li
                key={tenant.slug}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, duration: 0.4 }}
              >
                <a href={entryUrl} className="workspace-portal-card group flex h-full min-h-[9rem] flex-col p-0 sm:min-h-[12rem]">
                  <div className={`h-2 w-full bg-gradient-to-r ${grad}`} />
                  <div className="flex flex-1 flex-col justify-between gap-2 p-3 sm:p-3.5">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg border border-border/60 bg-background/80 p-1.5 shadow-sm">
                          <img src={brand.logoMark} alt="" className={`${brand.logoMarkClassName} h-7 sm:h-8`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight">{tenant.branding.shortName}</p>
                          <p className="font-mono text-[9px] text-muted-foreground">{host}</p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {tenant.modules.map((m) => {
                          const Meta = MODULE_META[m];
                          const Icon = Meta.icon;
                          return (
                            <span
                              key={m}
                              className="inline-flex items-center gap-0.5 rounded-md bg-muted/70 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                            >
                              <Icon className="h-2.5 w-2.5" />
                              {Meta.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <span className="inline-flex w-full items-center justify-center gap-0.5 rounded-lg bg-primary py-1.5 text-[10px] font-semibold text-primary-foreground shadow-sm group-hover:bg-primary/90 sm:gap-1 sm:py-2 sm:text-xs">
                      Open
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 sm:h-3.5 sm:w-3.5" />
                    </span>
                  </div>
                </a>
              </motion.li>
            );
          })}
        </ul>

        <p className="text-center text-[10px] text-muted-foreground sm:text-left">
          <span className="font-mono uppercase tracking-wider">{moduleLabels(TENANTS[0])}</span>
          {' '}and more — per company.
        </p>
      </motion.div>
    </WorkspacePortalShell>
  );
}
