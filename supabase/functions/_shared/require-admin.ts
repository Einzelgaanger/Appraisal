import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Gate for functions that hold the service role key.
 *
 * Supabase's function gateway only checks that a JWT is present, and the anon key
 * ships inside the public browser bundle — so "a request arrived" proves nothing
 * about who sent it. Any function that can create users or grant roles has to
 * establish the caller's identity itself.
 *
 * Returns a ready-to-send Response on rejection, or the service-role client and
 * the caller's identity on success.
 */
export async function requireGlobalAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; admin: SupabaseClient; callerId: string; callerEmail: string }
> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, response: json({ error: 'Missing authorization' }, 401) };
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Resolve the bearer token to a real user. The anon key on its own resolves to
  // nobody, which is what closes the public hole.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user?.id || !userData.user.email) {
    return { ok: false, response: json({ error: 'Invalid session' }, 401) };
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: role } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!role) {
    console.warn('Rejected non-admin call', { caller: userData.user.email, path: new URL(req.url).pathname });
    return { ok: false, response: json({ error: 'Administrator access required' }, 403) };
  }

  return {
    ok: true,
    admin,
    callerId: userData.user.id,
    callerEmail: userData.user.email.trim().toLowerCase(),
  };
}
