/**
 * Give a login access to a second company's roster row.
 *
 * Membership is deliberately curated rather than inferred: the same person uses
 * different email addresses at each company, so matching on name would be a guess,
 * and a wrong guess hands someone another company's appraisals.
 *
 * Reports what it would do by default. Pass --apply to write.
 *   node scripts/grant-company-access.mjs
 *   node scripts/grant-company-access.mjs --apply
 */
import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

// login email  ->  employee email of the additional company to grant
const GRANTS = [
  { login: 'bunmi.akinyemiju@peopleos.co', alsoActsAs: 'bunmi.akinyemiju@venturegardengroup.com' },
  { login: 'omotola.akinyemiju@venturegardengroup.com', alsoActsAs: 'omotola.akinyemiju@greenhouse.capital' },
  { login: 'adeosun.ayomide@venturegardengroup.com', alsoActsAs: 'ayomide.adeosun@venturegardengroup.com' },
];

const apply = process.argv.includes('--apply');

const c = new pg.Client({
  connectionString: `postgresql://postgres.qnorggoycwbbxdlvbcvq:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim())}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const report = [];

for (const grant of GRANTS) {
  const login = await c.query(
    `SELECT u.id FROM auth.users u WHERE lower(u.email) = lower($1)`,
    [grant.login],
  );
  const target = await c.query(
    `SELECT e.id, e.name, s.name AS company
     FROM public.employees e
     LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
     WHERE lower(e.email) = lower($1)`,
    [grant.alsoActsAs],
  );

  if (!login.rows.length || !target.rows.length) {
    report.push({
      login: grant.login,
      grants: grant.alsoActsAs,
      result: !login.rows.length ? 'SKIPPED — no such login' : 'SKIPPED — no such employee row',
    });
    continue;
  }

  const profileId = login.rows[0].id;
  const employeeId = target.rows[0].id;

  const already = await c.query(
    `SELECT 1 FROM public.employee_access WHERE profile_id = $1 AND employee_id = $2`,
    [profileId, employeeId],
  );

  if (already.rows.length) {
    report.push({ login: grant.login, grants: target.rows[0].company, result: 'already granted' });
    continue;
  }

  if (apply) {
    await c.query(
      `INSERT INTO public.employee_access (profile_id, employee_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [profileId, employeeId],
    );
  }

  report.push({
    login: grant.login,
    grants: target.rows[0].company,
    result: apply ? 'granted' : 'would grant (dry run)',
  });
}

console.table(report);

const summary = await c.query(`
  SELECT u.email AS login, count(*)::int AS companies,
         string_agg(s.name, ' | ' ORDER BY s.name) AS which
  FROM public.employee_access a
  JOIN auth.users u ON u.id = a.profile_id
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  GROUP BY u.email HAVING count(*) > 1 ORDER BY 1`);

console.log('\nLogins with access to more than one company:');
console.table(summary.rows);

if (!apply) console.log('\nDry run — re-run with --apply to write.');

await c.end();
