import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sprout,
  TreePalm,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import {
  commitSidebarLayout,
  getSidebarSnapshot,
  resetSidebarLayout,
  resizeSidebarTo,
  setSidebarCollapsed,
  SIDEBAR_COLLAPSED,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  subscribeSidebar,
} from '@/lib/sidebarChrome';
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

const SidebarCollapsedContext = createContext(false);

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
  const layout = useSyncExternalStore(subscribeSidebar, getSidebarSnapshot, getSidebarSnapshot);
  const drag = useRef<{ x: number; w: number; moved: boolean } | null>(null);
  const resizeEpoch = useRef(0);

  const finishResize = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (current.moved) commitSidebarLayout();
    const epoch = resizeEpoch.current;
    requestAnimationFrame(() => {
      if (resizeEpoch.current === epoch) delete document.documentElement.dataset.sidebarResizing;
    });
  };

  const onResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeEpoch.current += 1;
    drag.current = { x: event.clientX, w: getSidebarSnapshot().width, moved: false };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is unavailable for this pointer */
    }
    document.documentElement.dataset.sidebarResizing = 'true';
  };

  const onResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    if (Math.abs(event.clientX - current.x) < 3) return;
    current.moved = true;
    resizeSidebarTo(current.w + (event.clientX - current.x));
  };

  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const snap = getSidebarSnapshot();
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (snap.collapsed || snap.width <= SIDEBAR_MIN) {
        setSidebarCollapsed(true);
        return;
      }
      resizeSidebarTo(snap.width - 12);
      commitSidebarLayout();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      resizeSidebarTo((snap.collapsed ? SIDEBAR_COLLAPSED : snap.width) + 12);
      commitSidebarLayout();
    } else if (event.key === 'Home' || event.key === 'Escape') {
      event.preventDefault();
      resetSidebarLayout();
    }
  };

  return (
    <>
      <aside
        className={cn(
          'app-fixed-sidebar relative hidden lg:flex fixed left-0 z-30 flex-col border-r',
          chrome ? cn(chrome.border, chrome.panel, 'text-[hsl(0_0%_98%)]') : 'border-border bg-background',
        )}
        style={{ ['--sidebar-fade' as string]: chrome ? `rgb(${chrome.panelRgb})` : 'hsl(var(--background))' }}
      >
        {chrome ? (
          brand.logoStyle === 'lockup' ? (
            <div className={cn('sidebar-brand-band relative flex w-full shrink-0 items-center overflow-hidden border-b', chrome.border)}>
              {/*
                The cover art carries no wordmark, so bleed only its right-hand
                illustration off the edge and fade it into the panel.
              */}
              <div
                aria-hidden
                className="sidebar-brand-art pointer-events-none absolute inset-y-0 right-0 w-20"
                style={{
                  backgroundImage: `linear-gradient(to right, rgba(${chrome.panelRgb},1) 0%, rgba(${chrome.panelRgb},0) 65%), url(${brand.logo})`,
                  backgroundSize: 'auto, auto 100%',
                  backgroundPosition: 'left center, right center',
                  backgroundRepeat: 'no-repeat, no-repeat',
                }}
              />
              <div className="sidebar-brand-lockup relative flex items-center gap-2 pl-3.5">
                <img
                  src={brand.logoMark}
                  alt={brand.logoAlt}
                  className="h-8 w-8 shrink-0 rounded-md object-contain"
                />
                <span className="sidebar-wordmark font-display text-[15px] font-semibold leading-none tracking-[-0.01em] text-white">
                  {brand.wordmark}
                </span>
              </div>
            </div>
          ) : (
            <div className={cn('sidebar-brand-band relative flex w-full shrink-0 items-center overflow-hidden border-b', chrome.border)}>
              <img
                src={brand.logo}
                alt={brand.logoAlt}
                className="sidebar-banner-img absolute inset-0 h-full w-[111%] max-w-none -translate-x-[5%] object-cover object-left"
              />
              <img src={brand.logoMark} alt={brand.logoAlt} className="sidebar-collapsed-mark rounded-md" />
            </div>
          )
        ) : (
          <div className="sidebar-brand-band flex w-full shrink-0 items-center border-b border-border px-3.5">
            <img src={brand.logo} alt={brand.logoAlt} className={cn(brand.logoClassName, 'sidebar-banner-img max-h-8')} />
            <img src={brand.logoMark} alt={brand.logoAlt} className="sidebar-collapsed-mark rounded-md" />
          </div>
        )}

        <SidebarIdentity
          title={title}
          subtitle={subtitle}
          avatarUrl={avatarUrl}
          meta={visibleMeta}
          branded={branded}
          parentCredit={chrome ? brand.parentCredit : undefined}
          borderClass={chrome ? chrome.border : 'border-border'}
        />

        <SidebarCollapsedContext.Provider value={layout.collapsed}>
          <SidebarNav branded={branded} items={items} />
        </SidebarCollapsedContext.Provider>

        <div className={cn('sidebar-footer shrink-0 border-t', branded ? 'border-white/15' : 'border-border')}>
          <CompanySwitcher branded={branded} />
          {actions}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title={layout.collapsed ? 'Sign out' : undefined}
              className={cn(
                'flex h-8 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-medium transition-colors',
                branded
                  ? 'border border-white/20 text-white/90 hover:bg-white/10'
                  : 'border border-border bg-white/70 text-foreground hover:bg-white',
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSidebarCollapsed(!layout.collapsed)}
          className="absolute right-0 top-1/2 z-50 flex h-6 w-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-slate-700 shadow-md"
          aria-label={layout.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {layout.collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
        <div
          role="slider"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={layout.width}
          tabIndex={0}
          title="Drag to resize. Double-click to reset."
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onDoubleClick={() => {
            drag.current = null;
            delete document.documentElement.dataset.sidebarResizing;
            resetSidebarLayout();
          }}
          onKeyDown={onResizeKeyDown}
          className="group absolute inset-y-0 right-0 z-40 w-2.5 translate-x-1/2 cursor-col-resize touch-none outline-none"
        >
          <span className="pointer-events-none absolute inset-y-16 left-1/2 w-px -translate-x-1/2 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-40 group-focus-visible:opacity-70" />
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

function SidebarIdentity({
  title,
  subtitle,
  avatarUrl,
  meta,
  branded,
  parentCredit,
  borderClass,
}: {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  meta: SidebarMetaItem[];
  branded: boolean;
  parentCredit?: string;
  borderClass: string;
}) {
  return (
    <div className={cn('sidebar-identity shrink-0 border-b', borderClass)}>
      {parentCredit ? (
        <p className={cn('sidebar-parent-credit mb-1 text-[11px] leading-tight', branded ? 'text-white/55' : 'text-muted-foreground')}>
          {parentCredit}
        </p>
      ) : null}
      <h2 className={cn('sidebar-identity-copy font-display text-[15px] font-semibold leading-tight', branded ? 'text-white' : 'text-foreground')}>
        {title}
      </h2>
      <SidebarPerson name={subtitle} avatarUrl={avatarUrl} branded={branded} />
      {meta.length > 0 && (
        <>
          <div className="sidebar-meta mt-1.5 space-y-0.5">
            {meta.map((entry) => (
              <p key={entry.label} className="flex items-baseline justify-between gap-2 text-[12px] leading-tight">
                <span className={cn('shrink-0', branded ? 'text-white/55' : 'text-muted-foreground')}>{entry.label}</span>
                <span className={cn('min-w-0 truncate text-right font-medium', branded ? 'text-white/90' : 'text-foreground')}>{entry.value}</span>
              </p>
            ))}
          </div>
          <p className={cn('sidebar-meta-compact mt-0.5 truncate text-[11px] leading-tight', branded ? 'text-white/60' : 'text-muted-foreground')}>
            {meta.map((entry) => entry.value).filter(Boolean).join(' · ')}
          </p>
        </>
      )}
    </div>
  );
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
      <p className={cn('sidebar-identity-copy mt-0.5 truncate text-[12.5px] leading-tight', branded ? 'text-white/70' : 'text-muted-foreground')}>{name}</p>
    );
  }
  return (
    <div className="sidebar-identity-copy mt-1.5 flex items-center gap-2">
      <Avatar className={cn('h-8 w-8 shadow-sm', branded ? 'ring-2 ring-white/30' : 'ring-1 ring-black/10')}>
        <AvatarImage src={avatarUrl} alt="" />
        <AvatarFallback
          className={cn(
            'text-[11px] font-semibold',
            branded ? 'bg-white/15 text-white' : 'bg-teal-100 text-teal-800',
          )}
        >
          {personInitials(name)}
        </AvatarFallback>
      </Avatar>
      <p className={cn('min-w-0 truncate text-[13px] font-semibold leading-tight', branded ? 'text-white' : 'text-foreground')}>
        {name}
      </p>
    </div>
  );
}

function SidebarNav({ branded, items }: { branded: boolean; items: SidebarItem[] }) {
  const navRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => {
      setEdges({
        top: el.scrollTop > 6,
        bottom: el.scrollHeight - el.scrollTop - el.clientHeight > 6,
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observed = el.firstElementChild;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (observed) ro.observe(observed);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      {edges.top ? <div className="sidebar-scroll-fade sidebar-scroll-fade-top" /> : null}
      <nav
        ref={navRef}
        className="sidebar-nav absolute inset-0 overflow-y-auto overscroll-contain"
        aria-label="Sidebar Navigation"
      >
        <div className="space-y-0.5">
          {items.map((item) => (
            <SidebarNavItem key={item.key} item={item} branded={branded} />
          ))}
        </div>
      </nav>
      {edges.bottom ? <div className="sidebar-scroll-fade sidebar-scroll-fade-bottom" /> : null}
    </div>
  );
}

function revealGroup(node: HTMLElement | null) {
  if (!node) return;
  const nav = node.closest('.sidebar-nav');
  if (!(nav instanceof HTMLElement)) return;
  const navRect = nav.getBoundingClientRect();
  const groupRect = node.getBoundingClientRect();
  if (groupRect.height > navRect.height - 16) {
    nav.scrollTop += groupRect.top - navRect.top - 4;
    return;
  }
  const overflowBottom = groupRect.bottom - (navRect.bottom - 8);
  const overflowTop = navRect.top + 4 - groupRect.top;
  if (overflowBottom > 0) nav.scrollTop += overflowBottom;
  else if (overflowTop > 0) nav.scrollTop -= overflowTop;
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
  const collapsed = useContext(SidebarCollapsedContext);
  const childActive = Boolean(item.children?.some((child) => child.active));
  const [open, setOpen] = useState(childActive);
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setOpen(childActive);
  }, [childActive]);
  useEffect(() => {
    if (!open || collapsed) return;
    const id = requestAnimationFrame(() => revealGroup(groupRef.current));
    return () => cancelAnimationFrame(id);
  }, [open, collapsed]);

  if (item.children?.length) {
    return (
      <div ref={groupRef}>
        <button
          type="button"
          className={rowClass(false, branded, nested, childActive)}
          title={collapsed ? item.label : undefined}
          onClick={() => {
            if (collapsed) {
              setSidebarCollapsed(false);
              setOpen(true);
              return;
            }
            setOpen((prev) => !prev);
          }}
          aria-expanded={collapsed ? false : open}
        >
          <NavMark item={item} active={false} branded={branded} />
          <span className="sidebar-label min-w-0 flex-1 truncate text-left">{item.label}</span>
          <ChevronDown className={cn('sidebar-chevron h-3.5 w-3.5 shrink-0 opacity-60 transition-transform', open ? 'rotate-0' : '-rotate-90')} />
        </button>
        {open && (
          <div className="sidebar-children mt-0.5 space-y-0.5 pl-2">
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
      <span className="sidebar-label min-w-0 flex-1 truncate text-left">{item.label}</span>
    </>
  );

  if (item.to) {
    return (
      <Link to={item.to} className={className} title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={className} title={collapsed ? item.label : undefined} onClick={item.onClick} aria-current={active ? 'page' : undefined}>
      {inner}
    </button>
  );
}

function rowClass(active: boolean, branded: boolean, nested: boolean, childActive: boolean) {
  return cn(
    'sidebar-row group flex w-full items-center gap-2 rounded-xl px-1.5 text-left font-medium tracking-normal transition-colors',
    nested ? 'py-0.5 text-[13px]' : 'py-1 text-[13.5px]',
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
    <span className="sidebar-mark flex h-8 w-8 shrink-0 items-center justify-center">
      <span
        className={cn(
          'flex max-h-8 max-w-8 items-center justify-center transition-transform group-hover:scale-105 [&_svg]:shrink-0',
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
