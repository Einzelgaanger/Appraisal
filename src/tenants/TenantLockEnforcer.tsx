import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { useTenant } from '@/tenants/TenantContext';
import {
  getTenantBySlug,
  getTenantProductionHost,
  getTenantBySubsidiaryId,
} from '@/tenants/config';

/**
 * Sends the signed-in person to the host of the company they are acting as.
 * Choosing a company, or opening a site they belong to, updates that company
 * before this runs, so it does not pull them back to the previous one.
 */
export default function TenantLockEnforcer({ children }: { children: ReactNode }) {
  const { lockedTenantSlug, profile, isLoading } = useEmployeeAuth();
  const { setLockedTenantSlug, setSubsidiaryHint } = useTenant();
  const location = useLocation();

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
    if (isLoading || !lockedTenantSlug || typeof window === 'undefined') return;

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
  }, [isLoading, lockedTenantSlug, location.pathname, location.search]);

  return <>{children}</>;
}
