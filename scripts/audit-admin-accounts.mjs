/** Has anything unexpected been granted admin, or created outside the roster? Read-only. */
import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const { Client } = pg;
const ref = 'qnorggoycwbbxdlvbcvq';
const encoded = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim());

let client;
for (const host of ['aws-1-eu-west-1.pooler.supabase.com', 'aws-0-eu-west-1.pooler.supabase.com']) {
  const c = new Client({
    connectionString: `postgresql://postgres.${ref}:${encoded}@${host}:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  try { await c.connect(); client = c; break; } catch { try { await c.end(); } catch { /* ignore */ } }
}
if (!client) { console.error('no db connection'); process.exit(1); }

const q = async (label, sql) => {
  try {
    const r = await client.query(sql);
    console.log(`\n== ${label}`);
    if (!r.rows.length) console.log('   (none)');
    else console.table(r.rows);
  } catch (e) {
    console.log(`\n== ${label}\n   ERROR: ${e.message}`);
  }
};

await q('every global admin (user_roles)', `
  SELECT u.email, ur.role, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  ORDER BY ur.created_at`);

await q('every company_admin (employees)', `
  SELECT e.name, e.email, s.name AS company
  FROM public.employees e
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  WHERE e.company_admin
  ORDER BY e.name`);

await q('auth users with NO matching employee row (created outside the roster)', `
  SELECT u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at IS NOT NULL AS confirmed
  FROM auth.users u
  LEFT JOIN public.employees e ON lower(e.email) = lower(u.email)
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE e.id IS NULL AND p.employee_id IS NULL
  ORDER BY u.created_at DESC`);

await q('auth users by creation date (look for anything unexplained)', `
  SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS users
  FROM auth.users GROUP BY 1 ORDER BY 1 DESC`);

await q('employees rows created recently (complete-profile self-inserts?)', `
  SELECT e.name, e.email, s.name AS company, e.hierarchy_level, e.created_at
  FROM public.employees e
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  ORDER BY e.created_at DESC NULLS LAST LIMIT 10`);

await client.end();
