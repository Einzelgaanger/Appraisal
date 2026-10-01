/**
 * Start Docker + local Supabase, then write `.env.docker` (gitignored).
 *
 *   npm run db:local
 */
import { execSync } from 'child_process';
import { loadDotEnv, projectRoot } from './load-env.mjs';
import {
  parseSupabaseStatusEnv,
  runCommand,
  writeLocalEnv,
} from './local-supabase.mjs';

loadDotEnv({ files: ['.env'] });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForDocker(timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      execSync('docker info', { stdio: 'ignore' });
      return;
    } catch {
      if (Date.now() - started === 0 || (Date.now() - started) % 15000 < 2000) {
        console.log('Waiting for Docker Desktop…');
      }
      await sleep(2500);
    }
  }
  throw new Error(
    'Docker is not running. Start Docker Desktop, wait until it is idle, then rerun npm run db:local.',
  );
}

function tryStartDockerDesktop() {
  try {
    execSync(
      'powershell -NoProfile -Command "Start-Process \\"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe\\""',
      { stdio: 'ignore' },
    );
  } catch {
    /* already starting or not installed at the default path */
  }
}

async function main() {
  console.log('Starting local Supabase (Docker)…');
  tryStartDockerDesktop();
  await waitForDocker();
  await runCommand('npx', ['supabase', 'start']);

  const { stdout } = await runCommand('npx', ['supabase', 'status', '-o', 'env'], { silent: true });
  const status = parseSupabaseStatusEnv(stdout);
  const apiUrl = status.API_URL || status.SUPABASE_URL || 'http://127.0.0.1:54331';
  const anonKey = status.ANON_KEY || status.SUPABASE_ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl =
    status.DB_URL ||
    status.POSTGRES_URL ||
    'postgresql://postgres:postgres@127.0.0.1:54332/postgres';
  if (!anonKey || !serviceRoleKey) {
    throw new Error('supabase status did not return API keys. Check `npx supabase status`.');
  }

  writeLocalEnv({
    apiUrl,
    anonKey,
    serviceRoleKey,
    dbUrl,
    quarter: process.env.VITE_ACTIVE_APPRAISAL_QUARTER || '2026-Q3',
  });

  console.log('');
  console.log(`Wrote ${projectRoot()}\\.env.docker`);
  console.log(`API:    ${apiUrl}`);
  console.log(`Studio: ${status.STUDIO_URL || 'http://127.0.0.1:54333'}`);
  console.log('');
  console.log('Next:');
  console.log('  npm run db:local:reset     # apply migrations onto the empty local DB');
  console.log('  npm run db:local:sync      # copy production people + roles into Docker');
  console.log('  npm run seed:local         # extensive local-only demo data');
  console.log('  npm run dev:local          # Vite against Docker (not production)');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
