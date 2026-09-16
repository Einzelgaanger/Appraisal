/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_TENANT, resolveTenantFromHostname } from './config';
import type { TenantConfig } from './types';

interface TenantContextValue {
  tenant: TenantConfig;
  /** Prefer this subsidiary when hostname/query do not already pin a tenant (e.g. localhost). */
  setSubsidiaryHint: (subsidiaryId: string | null | undefined) => void;
  /** User→tenant lock from the employee row, not email domain. */
  setLockedTenantSlug: (slug: string | null | undefined) => void;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: DEFAULT_TENANT,
  setSubsidiaryHint: () => undefined,
  setLockedTenantSlug: () => undefined,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [subsidiaryHint, setSubsidiaryHintState] = useState<string | null>(null);
  const [lockedTenantSlug, setLockedTenantSlugState] = useState<string | null>(null);

  const setSubsidiaryHint = useCallback((subsidiaryId: string | null | undefined) => {
    setSubsidiaryHintState(subsidiaryId?.trim() || null);
  }, []);

  const setLockedTenantSlug = useCallback((slug: string | null | undefined) => {
    setLockedTenantSlugState(slug?.trim().toLowerCase() || null);
  }, []);

  const tenant = useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_TENANT;
    return resolveTenantFromHostname(window.location.hostname, location.search, {
      subsidiaryId: subsidiaryHint,
      lockedTenantSlug,
    });
  }, [location.search, subsidiaryHint, lockedTenantSlug]);

  useEffect(() => {
    document.documentElement.dataset.tenant = tenant.slug;
    document.title = `${tenant.branding.fullName} Appraisal`;

    const faviconHref =
      tenant.slug === 'ghc' ? '/ghc-favicon.png' : '/favicon.png';
    const themeColor =
      tenant.slug === 'ghc' ? '#003333' : tenant.slug === 'vigipay' ? '#0f2744' : '#1a2e22';

    const ensureLink = (rel: string, href: string) => {
      let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
      if (rel === 'icon') link.type = 'image/png';
    };

    ensureLink('icon', faviconHref);
    ensureLink('apple-touch-icon', faviconHref);

    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = themeColor;
  }, [tenant.slug, tenant.branding.fullName]);

  const value = useMemo(
    () => ({ tenant, setSubsidiaryHint, setLockedTenantSlug }),
    [tenant, setSubsidiaryHint, setLockedTenantSlug],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}
