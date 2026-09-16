/**
 * Migrate old → new using DB passwords (works even if CLI is on another account).
 * Pooler hosts: OLD aws-0-eu-west-1, NEW aws-1-eu-west-1
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

function loadEnv() {
  const env = { ...process.env };
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return env;
}

function run(label, cmd, args, opts = {}) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...(opts.env || {}) },
  });
  if ((r.status ?? 1) !== 0) {
    throw new Error(`FAILED: ${label} (exit ${r.status})`);
  }
}

function poolerUrl(host, ref, password) {
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;
}

function setEnvKey(key, val) {
  let text = readFileSync('.env', 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, `${key}=${val}`);
  else text += `\n${key}=${val}\n`;
  writeFileSync('.env', text);
}

function psql(host, ref, password, sqlOrArgs) {
  const args = [
    'run',
    '--rm',
    '-e',
    `PGPASSWORD=${password}`,
    'public.ecr.aws/supabase/postgres:17.6.1.111',
    'psql',
    '-h',
    host,
    '-p',
    '5432',
    '-U',
    `postgres.${ref}`,
    '-d',
    'postgres',
  ];
  if (typeof sqlOrArgs === 'string') {
    args.push('-c', sqlOrArgs);
  } else {
    args.push(...sqlOrArgs);
  }
  return spawnSync('docker', args, { encoding: 'utf8', shell: true });
}

const env = loadEnv();
const OLD_REF = env.OLD_SUPABASE_PROJECT_REF;
const NEW_REF = env.NEW_SUPABASE_PROJECT_REF;
const OLD_PWD = env.OLD_SUPABASE_DB_PASSWORD;
const NEW_PWD = env.NEW_SUPABASE_DB_PASSWORD;
const OLD_HOST = 'aws-0-eu-west-1.pooler.supabase.com';
const NEW_HOST = 'aws-1-eu-west-1.pooler.supabase.com';

if (!OLD_PWD || !NEW_PWD || !env.NEW_SUPABASE_ANON_KEY || !env.NEW_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env values');
  process.exit(1);
}

mkdirSync('tmp', { recursive: true });
const publicDump = join('tmp', `${OLD_REF}-data-public.sql`);
const authDump = join('tmp', `${OLD_REF}-data-auth.sql`);
const step = process.argv[2] || 'all';

if (step === 'all' || step === 'push') {
  run('Push migrations to NEW', 'npx', [
    'supabase',
    'db',
    'push',
    '--db-url',
    poolerUrl(NEW_HOST, NEW_REF, NEW_PWD),
    '--yes',
    '--include-all',
  ]);
}

if (step === 'all' || step === 'dump') {
  run('Dump PUBLIC from OLD', 'npx', [
    'supabase',
    'db',
    'dump',
    '--db-url',
    poolerUrl(OLD_HOST, OLD_REF, OLD_PWD),
    '--data-only',
    '--use-copy',
    '--schema',
    'public',
    '-f',
    publicDump,
    '--yes',
  ]);
  run('Dump AUTH from OLD', 'npx', [
    'supabase',
    'db',
    'dump',
    '--db-url',
    poolerUrl(OLD_HOST, OLD_REF, OLD_PWD),
    '--data-only',
    '--use-copy',
    '--schema',
    'auth',
    '-f',
    authDump,
    '--yes',
  ]);
  console.log(
    'Dump sizes:',
    statSync(publicDump).size,
    'public /',
    statSync(authDump).size,
    'auth',
  );
}

if (step === 'all' || step === 'restore') {
  if (!existsSync(publicDump) || !existsSync(authDump)) {
    throw new Error('Dump files missing — run dump first');
  }

  console.log('\n=== Prepare NEW for restore ===');
  let r = psql(NEW_HOST, NEW_REF, NEW_PWD, 'SET session_replication_role = replica; SELECT 1;');
  console.log(r.stdout || r.stderr);

  // Mount tmp and restore
  const mount = `${process.cwd().replace(/\\/g, '/')}/tmp:/dump`;
  console.log('\n=== Restore AUTH into NEW ===');
  r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-e',
      `PGPASSWORD=${NEW_PWD}`,
      '-v',
      mount,
      'public.ecr.aws/supabase/postgres:17.6.1.111',
      'psql',
      '-h',
      NEW_HOST,
      '-p',
      '5432',
      '-U',
      `postgres.${NEW_REF}`,
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=0',
      '-f',
      `/dump/${authDump.split(/[/\\]/).pop()}`,
    ],
    { stdio: 'inherit', shell: true },
  );
  console.log('auth restore exit', r.status);

  console.log('\n=== Restore PUBLIC into NEW ===');
  r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-e',
      `PGPASSWORD=${NEW_PWD}`,
      '-v',
      mount,
      'public.ecr.aws/supabase/postgres:17.6.1.111',
      'psql',
      '-h',
      NEW_HOST,
      '-p',
      '5432',
      '-U',
      `postgres.${NEW_REF}`,
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=0',
      '-f',
      `/dump/${publicDump.split(/[/\\]/).pop()}`,
    ],
    { stdio: 'inherit', shell: true },
  );
  console.log('public restore exit', r.status);

  console.log('\n=== Spot-check counts on NEW ===');
  r = psql(
    NEW_HOST,
    NEW_REF,
    NEW_PWD,
    `select 'auth.users' as t, count(*) from auth.users
     union all select 'profiles', count(*) from public.profiles
     union all select 'employees', count(*) from public.employees;`,
  );
  console.log(r.stdout || r.stderr);
}

if (step === 'all' || step === 'functions') {
  try {
    run('Deploy edge functions', 'npx', [
      'supabase',
      'functions',
      'deploy',
      '--project-ref',
      NEW_REF,
    ]);
  } catch (e) {
    console.error('\nFunctions deploy failed — re-login to the VGG Tools account that owns Company Appraisals, then rerun:');
    console.error('  node scripts/migrate-old-to-new-supabase.mjs functions');
  }
}

if (step === 'all' || step === 'switch-env') {
  console.log('\n=== Switch app .env to NEW ===');
  setEnvKey('VITE_SUPABASE_URL', env.NEW_SUPABASE_URL);
  setEnvKey('VITE_SUPABASE_PUBLISHABLE_KEY', env.NEW_SUPABASE_ANON_KEY);
  setEnvKey('SUPABASE_SERVICE_ROLE_KEY', env.NEW_SUPABASE_SERVICE_ROLE_KEY);
  setEnvKey('SUPABASE_DB_PASSWORD', NEW_PWD);
  console.log('Runtime env now points at', env.NEW_SUPABASE_URL);
}

console.log('\nCompleted step:', step);
