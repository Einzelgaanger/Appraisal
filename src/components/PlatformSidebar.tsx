import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import { isGhcTenant } from '@/tenants/config';

type SidebarItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  to?: string;
  onClick?: () => void;
  active?: boolean;
};

type SidebarMetaItem = {
  label: string;
  value?: string | null;
};

interface PlatformSidebarProps {
  title?: string;
  subtitle?: string;
  meta?: SidebarMetaItem[];
  items: SidebarItem[];
  onLogout?: () => void;
  actions?: React.ReactNode;
  /**
   * When true, no mobile top bar is rendered (parent supplies mobile chrome, e.g. bottom tabs).
   * Desktop sidebar is unchanged.
   */
  suppressMobileHeader?: boolean;
}

export default function PlatformSidebar({
  title = '360° Appraisal',
  subtitle,
  meta,
  items,
  onLogout,
  actions,
  suppressMobileHeader = false,
}: PlatformSidebarProps) {
  const { tenant } = useTenant();
  const brand = getTenantBrandAssets(tenant);
  const ghc = isGhcTenant(tenant);
  const visibleMeta = (meta ?? []).filter((entry) => Boolean(entry.value));

  return (
    <>
      <aside
        className={cn(
          'hidden lg:flex fixed left-0 top-0 z-30 h-screen w-72 flex-col border-r',
          ghc
            ? 'border-[hsl(180_28%_18%)] bg-[hsl(180_55%_10%)] text-[hsl(0_0%_98%)]'
            : 'border-border bg-background',
        )}
      >
        {ghc ? (
          <>
            <div className="relative w-full shrink-0 overflow-hidden border-b border-[hsl(180_28%_18%)]">
              <img
                src={brand.logo}
                alt={brand.logoAlt}
                className="block h-auto w-[111%] max-w-none -translate-x-[5%] object-cover object-left"
              />
            </div>
            <div className="border-b border-[hsl(180_28%_18%)] px-5 pb-5 pt-4">
              {brand.parentCredit ? (
                <p className="text-[10px] leading-snug text-white/55">{brand.parentCredit}</p>
              ) : null}
              <div className={brand.parentCredit ? 'mt-4' : undefined}>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
                  ◉ Workspace
                </p>
                <h2 className="font-display mt-1.5 text-base font-medium text-white">{title}</h2>
                {subtitle && <p className="mt-1 text-xs text-white/65">{subtitle}</p>}
              </div>
              {visibleMeta.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-white/15 pt-4">
                  {visibleMeta.map((entry) => (
                    <div key={entry.label} className="flex items-start justify-between gap-2 text-[11px] leading-tight">
                      <span className="font-mono uppercase tracking-[0.16em] text-white/50">{entry.label}</span>
                      <span className="font-medium text-right text-white">{entry.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="border-b border-border px-5 pb-5 pt-5">
            <img src={brand.logo} alt={brand.logoAlt} className={brand.logoClassName} />
            <div className="mt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                ◉ Workspace
              </p>
              <h2 className="font-display mt-1.5 text-base font-medium text-foreground">{title}</h2>
              {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            {visibleMeta.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                {visibleMeta.map((entry) => (
                  <div key={entry.label} className="flex items-start justify-between gap-2 text-[11px] leading-tight">
                    <span className="font-mono uppercase tracking-[0.16em] text-muted-foreground">{entry.label}</span>
                    <span className="font-medium text-right text-foreground">{entry.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Sidebar Navigation">
          {items.map((item) => {
            const className = cn(
              'relative w-full justify-start gap-2.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.16em]',
              item.active
                ? ghc
                  ? 'bg-[hsl(175_55%_32%)] text-white hover:bg-[hsl(175_55%_36%)] hover:text-white'
                  : 'bg-foreground text-background hover:bg-foreground hover:text-background'
                : ghc
                  ? 'text-white/70 hover:text-white hover:bg-white/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-paper-deep/60',
            );
            const activeBar = item.active ? (
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2',
                  ghc ? 'bg-[hsl(18_62%_58%)]' : 'bg-primary',
                )}
              />
            ) : null;

            if (item.to) {
              return (
                <Button key={item.key} variant="ghost" size="sm" asChild className={className}>
                  <Link to={item.to}>
                    {activeBar}
                    {item.icon}
                    {item.label}
                  </Link>
                </Button>
              );
            }

            return (
              <Button
                key={item.key}
                variant="ghost"
                size="sm"
                className={className}
                onClick={item.onClick}
              >
                {activeBar}
                {item.icon}
                {item.label}
              </Button>
            );
          })}
        </nav>

        <div className={cn('px-4 py-4 border-t space-y-2', ghc ? 'border-white/15' : 'border-border')}>
          {actions}
          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className={cn(
                'w-full gap-2',
                ghc && 'border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white',
              )}
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          )}
        </div>
      </aside>

      {!suppressMobileHeader && (
        <header
          className="lg:hidden sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex h-14 items-center gap-3 px-4">
            <img src={brand.logoMark} alt={brand.logoAlt} className="h-9 w-auto flex-shrink-0 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-medium text-foreground">{title}</p>
              {subtitle && (
                <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
        </header>
      )}
    </>
  );
}
