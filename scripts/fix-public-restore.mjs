/**
 * Fix incomplete public restore: truncate public tables, then reload dump
 * with session_replication_role=replica (avoids FK / seed conflicts).
 */
import { readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

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
const NEW_REF = env.NEW_SUPABASE_PROJECT_REF;
const NEW_PWD = env.NEW_SUPABASE_DB_PASSWORD;
const NEW_HOST = 'aws-1-eu-west-1.pooler.supabase.com';
const dumpFile = 'sgttsotrvemmgmujcuay-data-public.sql';
const mount = `${process.cwd().replace(/\\/g, '/')}/tmp:/dump`;

writeFileSync(
  join('tmp', '_reload_public.sql'),
  `SET session_replication_role = replica;
\\i /dump/${dumpFile}
SET session_replication_role = DEFAULT;
`,
);

function dockerPsql(extraArgs) {
  return spawnSync(
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
      ...extraArgs,
    ],
    { encoding: 'utf8', shell: false },
  );
}

console.log('=== Truncate all public tables ===');
const truncateSql = `
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', r.tablename);
  END LOOP;
END $$;
`;

let r = dockerPsql(['-v', 'ON_ERROR_STOP=1', '-c', truncateSql]);
console.log(r.stdout);
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(1);
}

console.log('=== Reload public dump with replica role ===');
r = dockerPsql(['-v', 'ON_ERROR_STOP=0', '-f', '/dump/_reload_public.sql']);
const out = `${r.stdout || ''}${r.stderr || ''}`;
const lines = out.split(/\r?\n/);
const errors = lines.filter((l) => /ERROR:/i.test(l));
console.log('errors:', errors.length);
errors.slice(0, 20).forEach((e) => console.log(e));
console.log('...');
console.log(lines.slice(-25).join('\n'));
console.log('reload exit', r.status);

console.log('=== Counts ===');
r = dockerPsql([
  '-c',
  `SELECT 'auth.users' AS t, COUNT(*)::int AS n FROM auth.users
   UNION ALL SELECT 'employees', COUNT(*)::int FROM public.employees
   UNION ALL SELECT 'profiles', COUNT(*)::int FROM public.profiles
   UNION ALL SELECT 'assessment_responses', COUNT(*)::int FROM public.assessment_responses
   UNION ALL SELECT 'subsidiaries', COUNT(*)::int FROM public.subsidiaries
   ORDER BY 1;`,
]);
console.log(r.stdout || r.stderr);
if (r.status !== 0) console.error(r.stderr);
