/** Verify the company-membership migration landed and changed nothing for existing users. */
import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const c = new pg.Client({
  connectionString: `postgresql://postgres.qnorggoycwbbxdlvbcvq:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim())}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const q = async (label, sql) => {
  const r = await c.query(sql);
  console.log(`\n== ${label}`);
  if (!r.rows.length) console.log('   (none)');
  else console.table(r.rows);
};

await q('tenants now linked to subsidiaries', `
  SELECT t.slug, t.appraisal_mode, s.name AS subsidiary
  FROM public.tenants t LEFT JOIN public.subsidiaries s ON s.id = t.subsidiary_id
  ORDER BY t.slug`);

await q('access backfill vs profiles', `
  SELECT (SELECT count(*)::int FROM public.employee_access) AS access_rows,
         (SELECT count(*)::int FROM public.profiles WHERE employee_id IS NOT NULL) AS profiles_with_employee,
         (SELECT count(*)::int FROM public.profiles WHERE active_employee_id IS NOT NULL) AS active_selected`);

await q('anyone with access to more than one company', `
  SELECT u.email AS login, count(*)::int AS companies,
         string_agg(s.name, ' | ' ORDER BY s.name) AS which
  FROM public.employee_access a
  JOIN auth.users u ON u.id = a.profile_id
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  GROUP BY u.email HAVING count(*) > 1 ORDER BY 1`);

// current_employee_id() reads auth.uid(), so impersonate a real login to prove the
// resolution path still returns the same employee it did before the migration.
const probe = await c.query(`
  SELECT p.id, u.email, p.employee_id FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.employee_id IS NOT NULL ORDER BY u.last_sign_in_at DESC NULLS LAST LIMIT 3`);

console.log('\n== current_employee_id() for real logins (expect resolved = profile employee_id)');
const rows = [];
for (const p of probe.rows) {
  await c.query('BEGIN');
  await c.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`, [p.id]);
  const got = await c.query('SELECT public.current_employee_id() AS resolved');
  const companies = await c.query('SELECT count(*)::int AS n FROM public.my_companies()');
  await c.query('ROLLBACK');
  rows.push({
    login: p.email,
    resolved_matches_profile: got.rows[0].resolved === p.employee_id,
    my_companies_returns: companies.rows[0].n,
  });
}
console.table(rows);

await c.end();
