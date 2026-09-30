/** Final state: one login per person, and cross-company access intact. Read-only. */
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

await q('totals', `
  SELECT (SELECT count(*)::int FROM auth.users) AS logins,
         (SELECT count(DISTINCT employee_id)::int FROM public.profiles WHERE employee_id IS NOT NULL) AS people,
         (SELECT count(*)::int FROM public.employee_access) AS access_rows`);

await q('any remaining duplicate logins for one roster row', `
  SELECT e.name, string_agg(u.email, ' + ') AS logins
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN public.employees e ON e.id = p.employee_id
  GROUP BY e.id, e.name HAVING count(*) > 1`);

await q('remaining @peopleos.co logins', `
  SELECT u.email, e.name AS person, s.name AS company,
         to_char(u.last_sign_in_at, 'YYYY-MM-DD') AS last_seen
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.employees e ON e.id = p.employee_id
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  WHERE u.email ILIKE '%@peopleos.co'
  ORDER BY u.email`);

await q('cross-company access still in place', `
  SELECT u.email AS login, count(*)::int AS companies,
         string_agg(s.name, ' | ' ORDER BY s.name) AS which
  FROM public.employee_access a
  JOIN auth.users u ON u.id = a.profile_id
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  GROUP BY u.email HAVING count(*) > 1 ORDER BY 1`);

await q('orphaned access rows (should be none)', `
  SELECT count(*)::int AS orphans FROM public.employee_access a
  LEFT JOIN public.profiles p ON p.id = a.profile_id WHERE p.id IS NULL`);

await c.end();
