import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

function loadEnv() {
  const env = {};
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

const env = loadEnv();
const checks = [
  ['OLD', env.OLD_SUPABASE_PROJECT_REF, env.OLD_SUPABASE_DB_PASSWORD],
  ['NEW', env.NEW_SUPABASE_PROJECT_REF, env.NEW_SUPABASE_DB_PASSWORD],
];

for (const [label, ref, pwd] of checks) {
  console.log(`\nTesting ${label} ${ref}...`);
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-e',
      `PGPASSWORD=${pwd}`,
      'public.ecr.aws/supabase/postgres:17.6.1.111',
      'psql',
      '-h',
      'aws-0-eu-west-1.pooler.supabase.com',
      '-p',
      '5432',
      '-U',
      `postgres.${ref}`,
      '-d',
      'postgres',
      '-c',
      'select current_database() as db, current_user as usr;',
    ],
    { encoding: 'utf8' },
  );
  console.log(r.stdout || '');
  if (r.status !== 0) {
    console.error(r.stderr);
    console.error(`${label} FAILED`);
    process.exit(1);
  }
  console.log(`${label} OK`);
}
