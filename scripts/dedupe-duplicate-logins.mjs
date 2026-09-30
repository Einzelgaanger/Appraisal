/**
 * Executive Office people who ended up with two logins pointing at the same roster
 * row: an old @peopleos.co account and a newer corporate one. The corporate address
 * is the canonical one, so that is the keeper.
 *
 * Deleting a login cascades to its profile, so this refuses to touch any account
 * whose profile still carries data. By default it also holds back any @peopleos.co
 * account that has actually been signed into, since losing it could strand someone.
 *
 *   node scripts/dedupe-duplicate-logins.mjs                    report only
 *   node scripts/dedupe-duplicate-logins.mjs --apply            delete the never-used ones
 *   node scripts/dedupe-duplicate-logins.mjs --apply --include-signed-in
 *       also delete legacy accounts that were used. Only safe once the corporate
 *       keeper is confirmed sign-in-able — see scripts/check-keeper-logins.mjs.
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const apply = process.argv.includes('--apply');
const includeSignedIn = process.argv.includes('--include-signed-in');

const c = new pg.Client({
  connectionString: `postgresql://postgres.qnorggoycwbbxdlvbcvq:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim())}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Everything that points at a login, either through its profile or directly at
// auth.users, so we can tell whether deleting it would take real data with it.
// employee_access is excluded: it is membership bookkeeping about this very login,
// and removing it is the point of the cleanup rather than a loss.
const refs = await c.query(`
  SELECT tc.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name <> 'employee_access'
    AND (
      (ccu.table_schema = 'public' AND ccu.table_name = 'profiles' AND ccu.column_name = 'id')
      OR (ccu.table_schema = 'auth' AND ccu.table_name = 'users' AND ccu.column_name = 'id')
    )`);

console.log(`Tables that would lose rows: ${refs.rows.map((r) => `${r.table_name}.${r.column_name}`).join(', ') || '(none)'}`);

const countReferences = async (profileId) => {
  const hits = [];
  for (const { table_name, column_name } of refs.rows) {
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.${table_name} WHERE ${column_name} = $1`,
      [profileId],
    );
    if (r.rows[0].n > 0) hits.push(`${table_name}=${r.rows[0].n}`);
  }
  return hits;
};

// Pair up the duplicates, preferring the non-peopleos.co address as the keeper.
const pairs = await c.query(`
  SELECT e.name AS person,
         json_agg(json_build_object(
           'profile_id', p.id,
           'email', u.email,
           'last_sign_in_at', u.last_sign_in_at,
           'created_at', u.created_at
         ) ORDER BY u.created_at) AS logins
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN public.employees e ON e.id = p.employee_id
  GROUP BY e.id, e.name
  HAVING count(*) > 1
  ORDER BY e.name`);

const safe = [];
const needsDecision = [];

for (const { person, logins } of pairs.rows) {
  const legacy = logins.filter((l) => /@peopleos\.co$/i.test(l.email));
  const keepers = logins.filter((l) => !/@peopleos\.co$/i.test(l.email));

  if (legacy.length !== 1 || keepers.length !== 1) {
    needsDecision.push({ person, why: 'unexpected shape', detail: logins.map((l) => l.email).join(' + ') });
    continue;
  }

  const [drop] = legacy;
  const [keep] = keepers;
  const data = await countReferences(drop.profile_id);
  const used = Boolean(drop.last_sign_in_at);

  const row = {
    person,
    delete: drop.email,
    keep: keep.email,
    legacy_last_used: drop.last_sign_in_at ? new Date(drop.last_sign_in_at).toISOString().slice(0, 10) : 'never',
    keeper_last_used: keep.last_sign_in_at ? new Date(keep.last_sign_in_at).toISOString().slice(0, 10) : 'never',
    data_on_legacy: data.length ? data.join(',') : 'none',
  };

  // Data loss is never overridable. A used-but-empty legacy account is, once the
  // keeper has been confirmed usable.
  if (data.length) {
    needsDecision.push({ ...row, why: 'legacy account carries data' });
  } else if (used && !includeSignedIn) {
    needsDecision.push({ ...row, why: 'legacy account has been signed into' });
  } else {
    safe.push({ ...row, note: used ? 'was used — keeper verified' : 'never used' });
  }
}

console.log(`\n== Safe to delete (${safe.length}) — never signed in, no data attached`);
console.table(safe);

console.log(`\n== Needs your decision (${needsDecision.length}) — NOT touched`);
console.table(needsDecision);

if (apply) {
  console.log('\nDeleting the safe accounts...');
  for (const row of safe) {
    const { rows } = await c.query('SELECT id FROM auth.users WHERE lower(email) = lower($1)', [row.delete]);
    if (!rows.length) { console.log(`  ${row.delete}: already gone`); continue; }
    const { error } = await admin.auth.admin.deleteUser(rows[0].id);
    console.log(`  ${row.delete}: ${error ? `FAILED ${error.message}` : 'deleted'}`);
  }
} else {
  console.log('\nDry run — re-run with --apply to delete the safe accounts.');
}

await c.end();
