/**
 * Mark hosted accounts that still use a shared company password.
 * They can sign in once, then the app requires a personal password.
 * Local Docker is left alone so demo passwords keep working there.
 *
 *   node scripts/flag-shared-passwords.mjs
 */
import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
if (!/supabase\.co/i.test(url)) {
  console.error('This only runs against the hosted project. Local Docker keeps the shared passwords.');
  process.exit(1);
}

const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!ref || !password) {
  console.error('Missing hosted project ref or SUPABASE_DB_PASSWORD.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const { rows } = await client.query(`
  UPDATE public.profiles p
  SET must_change_password = public.password_is_shared(u.encrypted_password)
  FROM auth.users u
  WHERE p.id = u.id
    AND public.password_is_shared(u.encrypted_password)
  RETURNING u.email
`);
console.log(`Asked ${rows.length} account${rows.length === 1 ? '' : 's'} to choose a personal password.`);
for (const row of rows) console.log(`  ${row.email}`);
await client.end();
