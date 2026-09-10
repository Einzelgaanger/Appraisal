/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_TENANT, resolveTenantFromHostname } from './config';
import type { TenantConfig } from './types';

interface TenantContextValue {
  tenant: TenantConfig;
}

const TenantContext = createContext<TenantContextValue>({ tenant: DEFAULT_TENANT });

export function TenantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();

  const tenant = useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_TENANT;
    return resolveTenantFromHostname(window.location.hostname, location.search);
  }, [location.search]);

  return <TenantContext.Provider value={{ tenant }}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}
