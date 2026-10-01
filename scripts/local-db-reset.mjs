/**
 * Wipe and replay migrations on local Docker only.
 *
 *   npm run db:local:reset
 */
import { assertLocalSupabaseUrl, localEnv, runCommand } from './local-supabase.mjs';

const env = localEnv();
assertLocalSupabaseUrl(env.VITE_SUPABASE_URL || env.SUPABASE_URL || 'http://127.0.0.1:54331', 'local');
await runCommand('npx', ['supabase', 'db', 'reset', '--yes']);
console.log('Local schema reset. Next: npm run db:local:sync && npm run seed:local');
