import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { useTenant } from '@/tenants/TenantContext';
import { GHC_SUBSIDIARY_ID } from '@/tenants/config';

function looksLikeGhcEmail(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase() ?? '';
  return e.endsWith('@greenhouse.capital') || e.endsWith('@greenhousecapital.com');
}

/**
 * When hostname/query do not pin a tenant (typical on localhost),
 * follow the signed-in employee's company so GHC staff get GHC branding + flows.
 * Email domain is a fallback before profile.subsidiary_id is set.
 */
export default function TenantSubsidiaryBridge({ children }: { children: ReactNode }) {
  const { profile, user, lockedTenantSlug } = useEmployeeAuth();
  const { setSubsidiaryHint } = useTenant();

  useEffect(() => {
    if (lockedTenantSlug) return;
    if (profile?.subsidiary_id) {
      setSubsidiaryHint(profile.subsidiary_id);
      return;
    }
    const email = profile?.email ?? user?.email;
    if (looksLikeGhcEmail(email)) {
      setSubsidiaryHint(GHC_SUBSIDIARY_ID);
      return;
    }
    setSubsidiaryHint(null);
  }, [lockedTenantSlug, profile?.subsidiary_id, profile?.email, user?.email, setSubsidiaryHint]);

  return <>{children}</>;
}
