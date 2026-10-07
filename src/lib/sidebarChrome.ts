/** Desktop sidebar width, collapse, and density. One store so the rail and page offset stay in sync. */

export const SIDEBAR_MIN = 196;
export const SIDEBAR_MAX = 280;
export const SIDEBAR_COLLAPSED = 72;

const WIDTH_KEY = 'vgg.sidebar.width';
const COLLAPSED_KEY = 'vgg.sidebar.collapsed';

export type SidebarDensity = 'regular' | 'compact' | 'tight';

export type SidebarSnapshot = {
  width: number;
  collapsed: boolean;
  density: SidebarDensity;
  preferred: number | null;
};

/** Cap the rail so a short or narrow window keeps most of the workspace. */
export function maxSidebarWidth(viewportWidth: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(viewportWidth * 0.22)));
}

/** Default width before anyone drags. Shorter screens get a tighter rail. */
export function autoSidebarWidth(viewportWidth: number, viewportHeight: number): number {
  let width = 240;
  if (viewportWidth < 1360 || viewportHeight < 860) width = 224;
  if (viewportWidth < 1200 || viewportHeight < 760) width = 208;
  return Math.min(width, maxSidebarWidth(viewportWidth));
}

export function clampSidebarWidth(px: number, viewportWidth: number): number {
  return Math.min(maxSidebarWidth(viewportWidth), Math.max(SIDEBAR_MIN, Math.round(px)));
}

export function sidebarDensity(viewportHeight: number): SidebarDensity {
  if (viewportHeight < 720) return 'tight';
  if (viewportHeight < 880) return 'compact';
  return 'regular';
}

function viewport() {
  if (typeof window === 'undefined') return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

function readPreferred(): number | null {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

let preferred: number | null = null;
let collapsed = false;
let snapshot: SidebarSnapshot = compute();
const listeners = new Set<() => void>();
const RESIZE_FLAG = '__vggSidebarResize';

function compute(): SidebarSnapshot {
  const { w, h } = viewport();
  const expanded = clampSidebarWidth(preferred ?? autoSidebarWidth(w, h), w);
  return {
    width: collapsed ? SIDEBAR_COLLAPSED : expanded,
    collapsed,
    density: sidebarDensity(h),
    preferred,
  };
}

function same(a: SidebarSnapshot, b: SidebarSnapshot) {
  return a.width === b.width && a.collapsed === b.collapsed && a.density === b.density && a.preferred === b.preferred;
}

function applyDom(next: SidebarSnapshot) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--app-sidebar-w', `${next.width}px`);
  root.dataset.sidebarDensity = next.density;
  root.dataset.sidebarCollapsed = next.collapsed ? 'true' : 'false';
}

function sync() {
  const next = compute();
  applyDom(next);
  if (same(snapshot, next)) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function persist() {
  try {
    if (preferred == null) localStorage.removeItem(WIDTH_KEY);
    else localStorage.setItem(WIDTH_KEY, String(preferred));
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export function getSidebarSnapshot(): SidebarSnapshot {
  return snapshot;
}

export function subscribeSidebar(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply a dragged width. Values under the minimum snap up; collapse is cleared. */
export function resizeSidebarTo(px: number) {
  const { w } = viewport();
  preferred = clampSidebarWidth(px, w);
  collapsed = false;
  sync();
}

export function commitSidebarLayout() {
  persist();
  sync();
}

export function resetSidebarLayout() {
  preferred = null;
  collapsed = false;
  persist();
  sync();
}

export function setSidebarCollapsed(next: boolean) {
  collapsed = next;
  persist();
  sync();
}

export function bootSidebarChrome() {
  preferred = readPreferred();
  collapsed = readCollapsed();
  sync();
  if (typeof window === 'undefined') return;
  const host = window as Window & { [RESIZE_FLAG]?: () => void };
  if (host[RESIZE_FLAG]) window.removeEventListener('resize', host[RESIZE_FLAG]);
  const onResize = () => sync();
  host[RESIZE_FLAG] = onResize;
  window.addEventListener('resize', onResize);
}
