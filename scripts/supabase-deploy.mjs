/**
 * Apply DB migrations and deploy edge functions to the linked Supabase project.
 *
 * Required in .env:
 *   SUPABASE_ACCESS_TOKEN  — Dashboard → Account → Access Tokens
 *   SUPABASE_DB_PASSWORD   — Dashboard → Project Settings → Database → password
 *     (or DATABASE_URL with postgres connection string)
 *
 * Also uses (already in .env for app/scripts):
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, …
 *
 * Usage:
 *   node scripts/supabase-deploy.mjs              # migrations + secrets + functions
 *   node scripts/supabase-deploy.mjs --db-only
 *   node scripts/supabase-deploy.mjs --functions-only
 *   node scripts/supabase-deploy.mjs --functions-only --fn=auth-email-hook
 *   node scripts/supabase-deploy.mjs --secrets-only
 */
import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadDotEnv, projectRoot } from './load-env.mjs';

loadDotEnv();

const root = projectRoot();
const args = process.argv.slice(2);
const dbOnly = args.includes('--db-only');
const functionsOnly = args.includes('--functions-only');
const secretsOnly = args.includes('--secrets-only');
const runDb = !functionsOnly && !secretsOnly;
const runSecrets = !dbOnly && !functionsOnly;
const runFunctions = !dbOnly && !secretsOnly;

function projectRef() {
  const configPath = join(root, 'supabase', 'config.toml');
  if (existsSync(configPath)) {
    const m = readFileSync(configPath, 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const fromUrl = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (fromUrl) return fromUrl[1];
  throw new Error('Could not resolve Supabase project ref (config.toml or VITE_SUPABASE_URL)');
}

function supabaseBin() {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const local = join(root, 'node_modules', '.bin', `supabase${ext}`);
  if (existsSync(local)) return local;
  return null;
}

function runSupabase(subArgs, opts = {}) {
  const local = supabaseBin();
  if (local) {
    run(local, subArgs, opts);
    return;
  }
  run('npx', ['--yes', 'supabase@latest', ...subArgs], opts);
}

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n> ${cmd} ${cmdArgs.join(' ')}`);
  const result = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref = projectRef();
if (accessToken) process.env.SUPABASE_ACCESS_TOKEN = accessToken;

const dbPassword =
  process.env.SUPABASE_DB_PASSWORD?.trim() ||
  (() => {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) return '';
    try {
      const u = new URL(url);
      return decodeURIComponent(u.password || '');
    } catch {
      return '';
    }
  })();

const hasDbCreds = Boolean(dbPassword || process.env.DATABASE_URL?.trim());

if (runDb && !accessToken && !hasDbCreds) {
  console.error('For migrations, add to .env:');
  console.error('  SUPABASE_ACCESS_TOKEN + SUPABASE_DB_PASSWORD  (npm run db:push)');
  console.error('  or SUPABASE_DB_PASSWORD only                 (npm run db:apply)');
  process.exit(1);
}

if ((runSecrets || runFunctions) && !accessToken) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env (required for functions deploy / secrets)');
  console.error('Create one at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

console.log(`Project: ${ref}`);

if (runDb) {
  if (accessToken) {
    if (!dbPassword) {
      console.error('Missing SUPABASE_DB_PASSWORD for supabase link / db push');
      process.exit(1);
    }
    runSupabase(['link', '--project-ref', ref, '-p', dbPassword], {
      env: { SUPABASE_ACCESS_TOKEN: accessToken },
    });
    runSupabase(['db', 'push'], { env: { SUPABASE_ACCESS_TOKEN: accessToken } });
  } else {
    run('node', ['scripts/apply-migrations.mjs']);
  }
} else if (accessToken && dbPassword) {
  runSupabase(['link', '--project-ref', ref, '-p', dbPassword], {
    env: { SUPABASE_ACCESS_TOKEN: accessToken },
  });
}

if (runSecrets) {
  const secretPairs = [];
  const add = (key) => {
    const v = process.env[key]?.trim();
    if (v) secretPairs.push(`${key}=${v}`);
  };

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (supabaseUrl) secretPairs.push(`SUPABASE_URL=${supabaseUrl}`);
  add('SUPABASE_SERVICE_ROLE_KEY');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (anon) secretPairs.push(`SUPABASE_ANON_KEY=${anon}`);
  add('LOVABLE_API_KEY');
  add('LOVABLE_SEND_URL');
  add('RESEND_API_KEY');
  add('RESEND_FROM_DOMAIN');
  add('RESEND_FROM_EMAIL');
  add('SEND_EMAIL_HOOK_SECRET');
  add('CLAUDE_API_KEY');
  add('CLAUDE_MODEL');
  add('PERPLEXITY_API_KEY');
  add('PERPLEXITY_MODEL');
  add('RECOMMENDATION_EVALUATE_TOKEN');

  if (secretPairs.length) {
    runSupabase(['secrets', 'set', ...secretPairs], {
      env: { SUPABASE_ACCESS_TOKEN: accessToken },
    });
  } else {
    console.log('\nNo edge-function secrets found in .env — skipping secrets set.');
  }
}

if (runFunctions) {
  const fnFilter = args.find((a) => a.startsWith('--fn='))?.slice(5)?.trim();
  const deployArgs = fnFilter ? ['functions', 'deploy', fnFilter] : ['functions', 'deploy'];
  runSupabase(deployArgs, {
    env: { SUPABASE_ACCESS_TOKEN: accessToken },
  });
}

console.log('\nDone.');
