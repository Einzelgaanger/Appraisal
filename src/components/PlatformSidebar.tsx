import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import CompanySwitcher from '@/components/CompanySwitcher';

/** Dark sidebar chrome for tenants that ship their own palette, sampled from their logos. */
const BRANDED_CHROME: Record<string, {
  border: string;
  panel: string;
  /** Panel colour as `r,g,b` so the lockup banner can fade artwork into it. */
  panelRgb: string;
  active: string;
  activeHover: string;
  rail: string;
}> = {
  ghc: {
    border: 'border-[hsl(180_28%_18%)]',
    panel: 'bg-[hsl(180_55%_10%)]',
    panelRgb: '11,40,40',
    active: 'bg-[hsl(175_55%_32%)]',
    activeHover: 'hover:bg-[hsl(175_55%_36%)]',
    rail: 'bg-[hsl(18_62%_58%)]',
  },
  vigipay: {
    border: 'border-[hsl(192_60%_22%)]',
    panel: 'bg-[hsl(192_100%_14%)]',
    panelRgb: '0,58,72',
    active: 'bg-[hsl(128_38%_36%)]',
    activeHover: 'hover:bg-[hsl(128_38%_42%)]',
    rail: 'bg-[hsl(42_78%_55%)]',
  },
};

/** Matches the height GHC's wordmark banner renders at in a 288px sidebar. */
const BRAND_BAND_HEIGHT = 58;

type SidebarItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  /** Nested destinations under a collapsible group (e.g. Appraisal). */
  children?: SidebarItem[];
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
  const chrome = BRANDED_CHROME[tenant.slug];
  const branded = Boolean(chrome);
  const visibleMeta = (meta ?? []).filter((entry) => Boolean(entry.value));

  return (
    <>
      <aside
        className={cn(
          'hidden lg:flex fixed left-0 top-0 z-30 h-screen w-72 flex-col border-r',
          chrome ? cn(chrome.border, chrome.panel, 'text-[hsl(0_0%_98%)]') : 'border-border bg-background',
        )}
      >
        {chrome ? (
          <>
            {brand.logoStyle === 'lockup' ? (
              <div
                className={cn(
                  'relative flex w-full shrink-0 items-center overflow-hidden border-b',
                  chrome.border,
                )}
                style={{ height: BRAND_BAND_HEIGHT }}
              >
                {/*
                  The cover art carries no wordmark, so bleed only its right-hand
                  illustration off the edge and fade it into the panel. Sizing on height
                  and anchoring right lands the crop on the artwork, clear of the tagline.
                */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 w-24"
                  style={{
                    backgroundImage: `linear-gradient(to right, rgba(${chrome.panelRgb},1) 0%, rgba(${chrome.panelRgb},0) 65%), url(${brand.logo})`,
                    backgroundSize: 'auto, auto 100%',
                    backgroundPosition: 'left center, right center',
                    backgroundRepeat: 'no-repeat, no-repeat',
                  }}
                />
                <div className="relative flex items-center gap-2.5 pl-5">
                  <img
                    src={brand.logoMark}
                    alt={brand.logoAlt}
                    className="h-9 w-9 shrink-0 rounded-md object-contain"
                  />
                  <span className="font-display text-[17px] font-semibold leading-none tracking-[-0.01em] text-white">
                    {brand.wordmark}
                  </span>
                </div>
              </div>
            ) : (
              <div className={cn('relative w-full shrink-0 overflow-hidden border-b', chrome.border)}>
                <img
                  src={brand.logo}
                  alt={brand.logoAlt}
                  className="block h-auto w-[111%] max-w-none -translate-x-[5%] object-cover object-left"
                />
              </div>
            )}
            <div className={cn('border-b px-5 pb-5 pt-4', chrome.border)}>
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
          {items.map((item) => (
            <SidebarNavItem key={item.key} item={item} chrome={chrome} branded={branded} />
          ))}
        </nav>

        <div className={cn('px-4 py-4 border-t space-y-2', branded ? 'border-white/15' : 'border-border')}>
          <CompanySwitcher branded={branded} />
          {actions}
          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className={cn(
                'w-full gap-2',
                branded && 'border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white',
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
            <img src={brand.logoMark} alt={brand.logoAlt} className="h-9 w-auto flex-shrink-0 rounded-md object-contain" />
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

function SidebarNavItem({
  item,
  chrome,
  branded,
}: {
  item: SidebarItem;
  chrome: (typeof BRANDED_CHROME)[string] | undefined;
  branded: boolean;
}) {
  const childActive = Boolean(item.children?.some((child) => child.active));
  const [open, setOpen] = useState(childActive);
  useEffect(() => {
    setOpen(childActive);
  }, [childActive]);

  const itemClass = (active: boolean) =>
    cn(
      'relative w-full justify-start gap-2.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.16em]',
      active
        ? chrome
          ? cn(chrome.active, chrome.activeHover, 'text-white hover:text-white')
          : 'bg-foreground text-background hover:bg-foreground hover:text-background'
        : branded
          ? 'text-white/70 hover:text-white hover:bg-white/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-paper-deep/60',
    );

  const activeBar = (active: boolean) =>
    active ? (
      <span
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2',
          chrome ? chrome.rail : 'bg-primary',
        )}
      />
    ) : null;

  if (item.children?.length) {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            itemClass(false),
            childActive && (branded ? 'text-white' : 'text-foreground'),
          )}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open ? 'rotate-0' : '-rotate-90')} />
        </Button>
        {open && (
          <div className="ml-2 mt-0.5 space-y-0.5 border-l border-white/15 pl-1" style={branded ? undefined : { borderColor: 'hsl(var(--border))' }}>
            {item.children.map((child) => {
              if (child.to) {
                return (
                  <Button key={child.key} variant="ghost" size="sm" asChild className={itemClass(Boolean(child.active))}>
                    <Link to={child.to}>
                      {activeBar(Boolean(child.active))}
                      {child.icon}
                      {child.label}
                    </Link>
                  </Button>
                );
              }
              return (
                <Button
                  key={child.key}
                  variant="ghost"
                  size="sm"
                  className={itemClass(Boolean(child.active))}
                  onClick={child.onClick}
                >
                  {activeBar(Boolean(child.active))}
                  {child.icon}
                  {child.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (item.to) {
    return (
      <Button variant="ghost" size="sm" asChild className={itemClass(Boolean(item.active))}>
        <Link to={item.to}>
          {activeBar(Boolean(item.active))}
          {item.icon}
          {item.label}
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="sm" className={itemClass(Boolean(item.active))} onClick={item.onClick}>
      {activeBar(Boolean(item.active))}
      {item.icon}
      {item.label}
    </Button>
  );
}
