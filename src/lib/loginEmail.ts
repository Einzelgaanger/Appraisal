import { supabase } from '@/integrations/supabase/client';

/** Use the resolved login when it is an email. Otherwise keep what was typed. */
export function loginEmailToTry(typed: string, canonical: string | null | undefined): string {
  const cleaned = typed.trim();
  const next = canonical?.trim();
  if (next && next.includes('@')) return next;
  return cleaned;
}

/**
 * Old addresses (previous domain, swapped name, or a renamed mailbox) sign in
 * as the live account. A failed lookup keeps the typed address.
 */
export async function resolveLoginEmail(typed: string): Promise<string> {
  const cleaned = typed.trim();
  if (!cleaned.includes('@')) return cleaned;
  try {
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, args: { _email: string }) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc('canonical_login_email', { _email: cleaned });
    if (error) return cleaned;
    return loginEmailToTry(cleaned, data);
  } catch {
    return cleaned;
  }
}
