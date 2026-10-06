import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  CircleUserRound,
  ClipboardPen,
  Crown,
  Gauge,
  LayoutGrid,
  LogOut,
  MessageSquareText,
  NotebookPen,
  ShieldCheck,
  Sprout,
  TreePalm,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenant } from '@/tenants/TenantContext';
import { getTenantBrandAssets } from '@/tenants/brandingAssets';
import CompanySwitcher from '@/components/CompanySwitcher';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/** Dark sidebar chrome for tenants that ship their own palette, sampled from their logos. */
const BRANDED_CHROME: Record<string, {
  border: string;
  panel: string;
  /** Panel colour as `r,g,b` so the lockup banner can fade artwork into it. */
  panelRgb: string;
}> = {
  ghc: {
    border: 'border-[hsl(180_28%_18%)]',
    panel: 'bg-[hsl(180_55%_10%)]',
    panelRgb: '11,40,40',
  },
  vigipay: {
    border: 'border-[hsl(192_60%_22%)]',
    panel: 'bg-[hsl(192_100%_14%)]',
    panelRgb: '0,58,72',
  },
};

/** Matches the height GHC's wordmark banner renders at in a 288px sidebar. */
const BRAND_BAND_HEIGHT = 58;

type NavLook = {
  Icon: LucideIcon;
  /** Tile shape. Sizes differ on purpose so the rail does not read as one repeated control. */
  shape: string;
  box: string;
  glyph: string;
  idle: string;
  idleOnDark: string;
  hot: string;
};

const NAV_LOOK: Record<string, NavLook> = {
  'appraisal-group': {
    Icon: NotebookPen,
    shape: 'rounded-2xl',
    box: 'h-9 w-9',
    glyph: 'h-[18px] w-[18px]',
    idle: 'bg-fuchsia-100 text-fuchsia-700',
    idleOnDark: 'bg-fuchsia-400/25 text-fuchsia-50',
    hot: 'bg-fuchsia-500 text-white',
  },
  survey: {
    Icon: MessageSquareText,
    shape: 'rounded-xl',
    box: 'h-8 w-8',
    glyph: 'h-4 w-4',
    idle: 'bg-sky-100 text-sky-700',
    idleOnDark: 'bg-sky-400/20 text-sky-50',
    hot: 'bg-sky-500 text-white',
  },
  dashboard: {
    Icon: Gauge,
    shape: 'rounded-lg',
    box: 'h-[30px] w-[30px]',
    glyph: 'h-4 w-4',
    idle: 'bg-violet-100 text-violet-700',
    idleOnDark: 'bg-violet-400/25 text-violet-50',
    hot: 'bg-violet-500 text-white',
  },
  growth: {
    Icon: Sprout,
    shape: 'rounded-full',
    box: 'h-10 w-10',
    glyph: 'h-5 w-5',
    idle: 'bg-emerald-100 text-emerald-700',
    idleOnDark: 'bg-emerald-400/20 text-emerald-50',
    hot: 'bg-emerald-500 text-white',
  },
  rankings: {
    Icon: Crown,
    shape: 'rounded-md',
    box: 'h-7 w-7',
    glyph: 'h-3.5 w-3.5',
    idle: 'bg-amber-100 text-amber-700',
    idleOnDark: 'bg-amber-400/25 text-amber-50',
    hot: 'bg-amber-500 text-white',
  },
  group: {
    Icon: Waypoints,
    shape: 'rounded-[10px]',
    box: 'h-8 w-8',
    glyph: 'h-4 w-4',
    idle: 'bg-indigo-100 text-indigo-700',
    idleOnDark: 'bg-indigo-400/25 text-indigo-50',
    hot: 'bg-indigo-500 text-white',
  },
  projects: {
    Icon: LayoutGrid,
    shape: 'rounded-2xl',
    box: 'h-8 w-10',
    glyph: 'h-4 w-4',
    idle: 'bg-orange-100 text-orange-700',
    idleOnDark: 'bg-orange-400/25 text-orange-50',
    hot: 'bg-orange-500 text-white',
  },
  leave: {
    Icon: TreePalm,
    shape: 'rounded-full',
    box: 'h-8 w-8',
    glyph: 'h-[18px] w-[18px]',
    idle: 'bg-teal-100 text-teal-700',
    idleOnDark: 'bg-teal-300/20 text-teal-50',
    hot: 'bg-teal-500 text-white',
  },
  profile: {
    Icon: CircleUserRound,
    shape: 'rounded-[14px]',
    box: 'h-9 w-9',
    glyph: 'h-[18px] w-[18px]',
    idle: 'bg-rose-100 text-rose-700',
    idleOnDark: 'bg-rose-400/25 text-rose-50',
    hot: 'bg-rose-500 text-white',
  },
  overview: {
    Icon: BarChart3,
    shape: 'rounded-xl',
    box: 'h-8 w-8',
    glyph: 'h-4 w-4',
    idle: 'bg-cyan-100 text-cyan-700',
    idleOnDark: 'bg-cyan-400/20 text-cyan-50',
    hot: 'bg-cyan-500 text-white',
  },
  appraisal: {
    Icon: ClipboardPen,
    shape: 'rounded-lg',
    box: 'h-[34px] w-[34px]',
    glyph: 'h-4 w-4',
    idle: 'bg-lime-100 text-lime-800',
    idleOnDark: 'bg-lime-400/20 text-lime-50',
    hot: 'bg-lime-600 text-white',
  },
  admin: {
    Icon: ShieldCheck,
    shape: 'rounded-full',
    box: 'h-[30px] w-[30px]',
    glyph: 'h-4 w-4',
    idle: 'bg-slate-200 text-slate-700',
    idleOnDark: 'bg-white/15 text-white',
    hot: 'bg-slate-700 text-white',
  },
};

const FALLBACK_LOOKS: NavLook[] = [
  NAV_LOOK.survey,
  NAV_LOOK.dashboard,
  NAV_LOOK.projects,
  NAV_LOOK.profile,
];

function lookFor(key: string): NavLook {
  const known = NAV_LOOK[key];
  if (known) return known;
  let n = 0;
  for (let i = 0; i < key.length; i += 1) n += key.charCodeAt(i);
  return FALLBACK_LOOKS[n % FALLBACK_LOOKS.length];
}

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
  /** Saved profile photo. Shown beside the person's name in the sidebar. */
  avatarUrl?: string | null;
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
  avatarUrl,
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
          'app-fixed-sidebar hidden lg:flex fixed left-0 z-30 w-72 flex-col border-r',
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
                <p className="text-[12px] leading-snug text-white/55">{brand.parentCredit}</p>
              ) : null}
              <div className={brand.parentCredit ? 'mt-4' : undefined}>
                <h2 className="font-display text-[17px] font-semibold leading-snug text-white">{title}</h2>
                <SidebarPerson name={subtitle} avatarUrl={avatarUrl} branded />
              </div>
              {visibleMeta.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {visibleMeta.map((entry) => (
                    <p key={entry.label} className="flex items-start justify-between gap-3 text-[12.5px] leading-snug">
                      <span className="shrink-0 text-white/55">{entry.label}</span>
                      <span className="text-right font-medium text-white/90">{entry.value}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="border-b border-border px-5 pb-5 pt-5">
            <img src={brand.logo} alt={brand.logoAlt} className={brand.logoClassName} />
            <div className="mt-5">
              <h2 className="font-display text-[17px] font-semibold leading-snug text-foreground">{title}</h2>
              <SidebarPerson name={subtitle} avatarUrl={avatarUrl} />
            </div>
            {visibleMeta.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {visibleMeta.map((entry) => (
                  <p key={entry.label} className="flex items-start justify-between gap-3 text-[12.5px] leading-snug">
                    <span className="shrink-0 text-muted-foreground">{entry.label}</span>
                    <span className="text-right font-medium text-foreground">{entry.value}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <nav
          className="sidebar-nav min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4"
          aria-label="Sidebar Navigation"
        >
          {items.map((item) => (
            <SidebarNavItem key={item.key} item={item} branded={branded} />
          ))}
        </nav>

        <div className={cn('px-4 py-4 border-t space-y-2', branded ? 'border-white/15' : 'border-border')}>
          <CompanySwitcher branded={branded} />
          {actions}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className={cn(
                'flex h-10 w-full items-center justify-center gap-2 rounded-2xl text-[13px] font-medium transition-colors',
                branded
                  ? 'border border-white/20 text-white/90 hover:bg-white/10'
                  : 'border border-border bg-white/70 text-foreground hover:bg-white',
              )}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
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

function personInitials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return letters || 'ME';
}

function SidebarPerson({
  name,
  avatarUrl,
  branded = false,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  branded?: boolean;
}) {
  if (!name) return null;
  if (!avatarUrl) {
    return (
      <p className={cn('mt-1 text-[13px]', branded ? 'text-white/70' : 'text-muted-foreground')}>{name}</p>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-3">
      <Avatar className={cn('h-12 w-12 shadow-sm', branded ? 'ring-2 ring-white/30' : 'ring-1 ring-black/10')}>
        <AvatarImage src={avatarUrl} alt="" />
        <AvatarFallback
          className={cn(
            'text-sm font-semibold',
            branded ? 'bg-white/15 text-white' : 'bg-teal-100 text-teal-800',
          )}
        >
          {personInitials(name)}
        </AvatarFallback>
      </Avatar>
      <p className={cn('min-w-0 truncate text-[15px] font-semibold leading-snug', branded ? 'text-white' : 'text-foreground')}>
        {name}
      </p>
    </div>
  );
}

function SidebarNavItem({
  item,
  branded,
  nested = false,
}: {
  item: SidebarItem;
  branded: boolean;
  nested?: boolean;
}) {
  const childActive = Boolean(item.children?.some((child) => child.active));
  const [open, setOpen] = useState(childActive);
  useEffect(() => {
    setOpen(childActive);
  }, [childActive]);

  if (item.children?.length) {
    return (
      <div>
        <button
          type="button"
          className={rowClass(false, branded, nested, childActive)}
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
        >
          <NavMark item={item} active={false} branded={branded} />
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', open ? 'rotate-0' : '-rotate-90')} />
        </button>
        {open && (
          <div className="mt-1 space-y-1 pl-3">
            {item.children.map((child) => (
              <SidebarNavItem key={child.key} item={child} branded={branded} nested />
            ))}
          </div>
        )}
      </div>
    );
  }

  const active = Boolean(item.active);
  const className = rowClass(active, branded, nested, false);
  const inner = (
    <>
      <NavMark item={item} active={active} branded={branded} />
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
    </>
  );

  if (item.to) {
    return (
      <Link to={item.to} className={className} aria-current={active ? 'page' : undefined}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={item.onClick} aria-current={active ? 'page' : undefined}>
      {inner}
    </button>
  );
}

function rowClass(active: boolean, branded: boolean, nested: boolean, childActive: boolean) {
  return cn(
    'group flex w-full items-center gap-2.5 rounded-2xl px-2 text-left font-medium tracking-normal transition-colors',
    nested ? 'min-h-10 py-1 text-[13.5px]' : 'min-h-11 py-1.5 text-[15px]',
    active
      ? branded
        ? 'bg-white/10 text-white'
        : 'bg-white text-foreground shadow-sm ring-1 ring-black/5'
      : branded
        ? childActive
          ? 'text-white hover:bg-white/10'
          : 'text-white/80 hover:bg-white/10 hover:text-white'
        : childActive
          ? 'text-foreground hover:bg-white/70'
          : 'text-foreground/80 hover:bg-white/70 hover:text-foreground',
  );
}

function NavMark({
  item,
  active,
  branded,
}: {
  item: SidebarItem;
  active: boolean;
  branded: boolean;
}) {
  const look = lookFor(item.key);
  const known = Boolean(NAV_LOOK[item.key]);
  const keepArtwork = item.key === 'growth' && item.icon;

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center">
      <span
        className={cn(
          'flex items-center justify-center transition-transform group-hover:scale-105 [&_svg]:shrink-0',
          keepArtwork
            ? '[&_img]:h-7 [&_img]:w-7 [&_img]:rounded-full [&_img]:object-contain'
            : '[&_img]:h-5 [&_img]:w-5 [&_img]:rounded-md [&_img]:object-contain',
          look.shape,
          look.box,
          active ? look.hot : branded ? look.idleOnDark : look.idle,
        )}
      >
        {keepArtwork || (!known && item.icon) ? (
          item.icon
        ) : (
          <look.Icon className={look.glyph} strokeWidth={2.25} />
        )}
      </span>
    </span>
  );
}
