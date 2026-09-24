/** Is the tenant_* schema populated and wired, or dead weight? Read-only. */
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
    if (!r.rows.length) console.log('   (empty)');
    else console.table(r.rows);
  } catch (e) {
    console.log(`\n== ${label}\n   ERROR: ${e.message}`);
  }
};

await q('row counts across tenant_* tables', `
  SELECT 'tenants' t, count(*)::int n FROM public.tenants
  UNION ALL SELECT 'tenant_domains', count(*)::int FROM public.tenant_domains
  UNION ALL SELECT 'tenant_routing_rules', count(*)::int FROM public.tenant_routing_rules
  UNION ALL SELECT 'tenant_modules', count(*)::int FROM public.tenant_modules
  UNION ALL SELECT 'tenant_role_definitions', count(*)::int FROM public.tenant_role_definitions
  UNION ALL SELECT 'tenant_hierarchy_levels', count(*)::int FROM public.tenant_hierarchy_levels
  UNION ALL SELECT 'tenant_appraisal_configs', count(*)::int FROM public.tenant_appraisal_configs
  UNION ALL SELECT 'tenant_form_sets', count(*)::int FROM public.tenant_form_sets
  ORDER BY 1`);

await q('tenants', `SELECT * FROM public.tenants`);
await q('tenant_domains', `SELECT * FROM public.tenant_domains`);
await q('tenant_routing_rules', `SELECT * FROM public.tenant_routing_rules`);

await q('current_employee_id() definition', `
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='current_employee_id'`);

await q('ghc_member_pool() definition', `
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='ghc_member_pool'`);

await q('any function mentioning locked_tenant or tenant switching', `
  SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND pg_get_functiondef(p.oid) ILIKE '%locked_tenant_slug%'
  ORDER BY 1`);

await client.end();
