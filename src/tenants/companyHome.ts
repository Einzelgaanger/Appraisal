import { supabase } from '@/integrations/supabase/client';
import {
  getTenantBySlug,
  getTenantProductionHost,
  getTenantProductionOrigin,
} from './config';

export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().split(':')[0];
  return h === 'localhost' || h === '127.0.0.1';
}

/** Origin the person should use for this company (localhost stays local). */
export function companyOrigin(slug: string | null | undefined): string {
  const tenant = getTenantBySlug(slug);
  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    return window.location.origin;
  }
  if (tenant) return getTenantProductionOrigin(tenant);
  return typeof window !== 'undefined' ? window.location.origin : 'https://vgg.tools';
}

/**
 * Full URL inside a company workspace. On production this hops to that
 * company's host so a GHC person never stays on vigipay.vgg.tools.
 */
export function companyWorkspaceUrl(slug: string | null | undefined, pathWithSearch = '/'): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : companyOrigin(slug);
  const dest = new URL(pathWithSearch, origin);
  if (slug) dest.searchParams.set('tenant', slug);
  const tenant = getTenantBySlug(slug);
  if (typeof window !== 'undefined' && !isLocalHostname(window.location.hostname) && tenant) {
    dest.protocol = 'https:';
    dest.hostname = getTenantProductionHost(tenant);
    dest.port = '';
  }
  return dest.toString();
}

export async function lookupSignedInCompanySlug(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_companies');
  if (!error && Array.isArray(data) && data.length) {
    const rows = data as { tenant_slug?: string | null; is_active?: boolean }[];
    const active = rows.find((row) => row.is_active) ?? rows[0];
    const slug = active?.tenant_slug?.trim().toLowerCase();
    if (slug) return slug;
  }
  return null;
}

export async function lookupTenantSlugForEmail(email: string): Promise<string | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc('tenant_slug_for_email', { _email: trimmed });
  if (error || typeof data !== 'string') return null;
  const slug = data.trim().toLowerCase();
  return slug || null;
}
