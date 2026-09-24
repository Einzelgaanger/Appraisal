/**
 * Prove switching works: my_companies lists both, set_active_company moves
 * current_employee_id(), and a company the caller has no access to is refused.
 * Runs inside a transaction that is always rolled back, so nothing is left changed.
 */
import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const c = new pg.Client({
  connectionString: `postgresql://postgres.qnorggoycwbbxdlvbcvq:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim())}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const LOGIN = 'bunmi.akinyemiju@peopleos.co';
const { rows: who } = await c.query('SELECT id FROM auth.users WHERE lower(email) = lower($1)', [LOGIN]);
const uid = who[0].id;

await c.query('BEGIN');
await c.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`, [uid]);

console.log(`Acting as ${LOGIN}\n`);

const before = await c.query('SELECT * FROM public.my_companies()');
console.log('== my_companies()');
console.table(before.rows);

const startedAt = await c.query('SELECT public.current_employee_id() AS employee');
const target = before.rows.find((r) => !r.is_active);

const slug = await c.query('SELECT public.set_active_company($1) AS routed_to', [target.employee_id]);
const after = await c.query('SELECT public.current_employee_id() AS employee');

console.log('== switching');
console.table([{
  switched_to: target.company_name,
  set_active_company_returned: slug.rows[0].routed_to,
  current_employee_id_moved: startedAt.rows[0].employee !== after.rows[0].employee,
  now_resolves_to_target: after.rows[0].employee === target.employee_id,
}]);

const nowActive = await c.query('SELECT company_name, is_active FROM public.my_companies()');
console.log('== my_companies() after the switch');
console.table(nowActive.rows);

// A company this login has no access to must be refused even though the RPC is
// SECURITY DEFINER and could otherwise write anything.
const { rows: outsider } = await c.query(`
  SELECT e.id, s.name FROM public.employees e
  JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  WHERE e.id NOT IN (SELECT employee_id FROM public.employee_access WHERE profile_id = $1)
  LIMIT 1`, [uid]);

let refused = 'NOT REFUSED — this is a problem';
try {
  await c.query('SAVEPOINT probe');
  await c.query('SELECT public.set_active_company($1)', [outsider[0].id]);
  await c.query('ROLLBACK TO SAVEPOINT probe');
} catch (e) {
  await c.query('ROLLBACK TO SAVEPOINT probe');
  refused = `refused: ${e.message}`;
}
console.log('== switching to a company without access');
console.table([{ attempted: outsider[0].name, result: refused }]);

await c.query('ROLLBACK');
console.log('\nRolled back — no changes persisted.');
await c.end();
