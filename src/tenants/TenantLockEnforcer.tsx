import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { useTenant } from '@/tenants/TenantContext';
import {
  getTenantBySlug,
  getTenantProductionHost,
  getTenantBySubsidiaryId,
  TENANTS,
} from '@/tenants/config';

/**
 * Lock is stored on the employee row. Domain is never used:
 * VGG emails exist on GHC/EO, and some people will later sit on multiple systems.
 */
function tenantSlugFromHost(hostname: string, search: string): string | null {
  const host = hostname.toLowerCase().split(':')[0];
  const params = new URLSearchParams(search);
  const fromQuery = params.get('tenant');
  if (host === 'localhost' || host === '127.0.0.1') return fromQuery;
  const subdomain = host.split('.')[0] ?? '';
  const fromHost = TENANTS.find((tenant) => tenant.subdomains.includes(subdomain));
  return fromHost?.slug ?? fromQuery;
}

export default function TenantLockEnforcer({ children }: { children: ReactNode }) {
  const { lockedTenantSlug, profile, companies, isLoading, switchCompany } = useEmployeeAuth();
  const { setLockedTenantSlug, setSubsidiaryHint } = useTenant();
  const location = useLocation();
  const adopting = useRef(false);
  const failedSeat = useRef<string | null>(null);

  useEffect(() => {
    setLockedTenantSlug(lockedTenantSlug);
    if (lockedTenantSlug) {
      const locked = getTenantBySlug(lockedTenantSlug);
      if (locked?.subsidiaryId) setSubsidiaryHint(locked.subsidiaryId);
      return;
    }
    if (profile?.subsidiary_id) {
      const fromProfile = getTenantBySubsidiaryId(profile.subsidiary_id);
      if (fromProfile) setSubsidiaryHint(profile.subsidiary_id);
    }
  }, [lockedTenantSlug, profile?.subsidiary_id, setLockedTenantSlug, setSubsidiaryHint]);

  useEffect(() => {
    if (isLoading || !lockedTenantSlug || typeof window === 'undefined' || adopting.current) return;
    const asked = tenantSlugFromHost(window.location.hostname, location.search);
    if (asked && asked !== lockedTenantSlug) {
      const seats = companies.filter((company) => company.tenant_slug === asked);
      const ownName = profile?.name?.trim().toLowerCase() ?? '';
      // Only the seat that belongs to this person. A single seat under someone
      // else's name must not be opened, or the visit lands on the wrong company.
      const ownSeat = ownName
        ? seats.find((company) => company.employee_name?.trim().toLowerCase() === ownName) ?? null
        : (seats.length === 1 ? seats[0] : null);
      if (ownSeat && failedSeat.current !== ownSeat.employee_id) {
        if (!ownSeat.is_active) {
          adopting.current = true;
          void switchCompany(ownSeat.employee_id).then((result) => {
            if (result.error) failedSeat.current = ownSeat.employee_id;
          }).finally(() => {
            adopting.current = false;
          });
        }
        return;
      }
    }

    const locked = getTenantBySlug(lockedTenantSlug);
    if (!locked) return;

    const host = window.location.hostname.toLowerCase().split(':')[0];
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    const prodHost = getTenantProductionHost(locked);
    const params = new URLSearchParams(location.search);
    const queryTenant = params.get('tenant');

    if (!isLocal && host !== prodHost && !host.endsWith('.supabase.co')) {
      const next = new URL(window.location.href);
      next.protocol = 'https:';
      next.hostname = prodHost;
      next.port = '';
      next.searchParams.set('tenant', lockedTenantSlug);
      window.location.replace(next.toString());
      return;
    }

    if (queryTenant !== lockedTenantSlug) {
      const next = new URL(window.location.href);
      next.searchParams.set('tenant', lockedTenantSlug);
      if (next.toString() !== window.location.href) {
        window.location.replace(next.toString());
      }
    }
  }, [companies, isLoading, lockedTenantSlug, location.pathname, location.search, profile?.name, switchCompany]);

  return <>{children}</>;
}
