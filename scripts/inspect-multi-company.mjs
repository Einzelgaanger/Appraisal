/**
 * How are people who belong to more than one company represented today?
 * Read-only.
 */
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
    if (!r.rows.length) console.log('   (no rows)');
    else console.table(r.rows);
  } catch (e) {
    console.log(`\n== ${label}\n   ERROR: ${e.message}`);
  }
};

await q('employees columns', `
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='employees' ORDER BY ordinal_position`);

await q('profiles columns', `
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position`);

await q('is there any membership/junction table?', `
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public'
    AND (table_name ILIKE '%member%' OR table_name ILIKE '%tenant%' OR table_name ILIKE '%company%')
  ORDER BY table_name`);

await q('subsidiaries', `SELECT id, name FROM public.subsidiaries ORDER BY name`);

await q('people with employee rows in MORE THAN ONE subsidiary (by name)', `
  SELECT e.name,
         count(*)::int AS rows,
         string_agg(DISTINCT s.name, ' | ' ORDER BY s.name) AS companies,
         string_agg(DISTINCT coalesce(e.email,'(no email)'), ' | ') AS emails
  FROM public.employees e
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  GROUP BY e.name
  HAVING count(DISTINCT e.subsidiary_id) > 1
  ORDER BY e.name`);

await q('auth users whose email matches employee rows in >1 subsidiary', `
  SELECT u.email,
         count(DISTINCT e.subsidiary_id)::int AS subsidiaries,
         string_agg(DISTINCT s.name, ' | ') AS companies
  FROM auth.users u
  JOIN public.employees e ON lower(e.email) = lower(u.email)
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  GROUP BY u.email
  HAVING count(DISTINCT e.subsidiary_id) > 1`);

await q('locked_tenant_slug distribution', `
  SELECT coalesce(locked_tenant_slug,'(null)') AS locked, count(*)::int AS employees
  FROM public.employees GROUP BY 1 ORDER BY 2 DESC`);

await q('pool flags vs subsidiary', `
  SELECT s.name AS subsidiary,
         count(*)::int AS total,
         count(*) FILTER (WHERE e.ghc_appraisal_active)::int AS ghc_active,
         count(*) FILTER (WHERE e.vigipay_appraisal_active)::int AS vigipay_active,
         count(*) FILTER (WHERE e.company_admin)::int AS company_admins
  FROM public.employees e
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  GROUP BY s.name ORDER BY s.name`);

await q('auth users vs linked profiles/employees', `
  SELECT count(*)::int AS auth_users,
         count(p.id)::int AS have_profile,
         count(p.employee_id)::int AS profile_linked_to_employee
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id`);

await client.end();
