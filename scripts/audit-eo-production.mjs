/**
 * Executive Team (BOOM) production readiness snapshot.
 * Usage: node scripts/audit-eo-production.mjs
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { loadDotEnv, projectRoot } from './load-env.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

loadDotEnv();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const EO = '11111111-1111-1111-1111-111111111111';
const q = `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
const month = new Date().toISOString().slice(0, 7);

const checks = [];
function pass(label, ok, detail = '') {
  checks.push({ label, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log(`\n=== Executive Team BOOM audit (${month} / ${q}) ===\n`);

const { data: emps, error: eErr } = await admin
  .from('employees')
  .select('id,name,email,eo_appraisal_active,hierarchy_level')
  .eq('subsidiary_id', EO);
if (eErr) {
  console.error(eErr);
  process.exit(1);
}

const active = (emps || []).filter((e) => e.eo_appraisal_active);
pass('Active EO appraisal roster', active.length >= 17, `active=${active.length}, total EO=${emps?.length}`);

const { data: profiles } = await admin.from('profiles').select('id,email,employee_id');
const linked = active.filter((e) => (profiles || []).some((p) => p.employee_id === e.id));
pass('Active roster has profile links', linked.length === active.length, `${linked.length}/${active.length}`);

const { data: forms } = await admin.from('assessment_forms').select('code,title').in('code', [
  'peer_360', 'monthly_self', 'executive', 'ea_quarterly', 'epa_gceo_assessor',
]);
pass('Core BOOM forms exist', (forms || []).length >= 4, (forms || []).map((f) => f.code).join(', '));

const peerForm = (forms || []).find((f) => f.code === 'peer_360');
let active360 = 0;
if (peerForm) {
  const { data: qs } = await admin
    .from('assessment_questions')
    .select('id,is_active,question_type')
    .eq('form_id', peerForm.id)
    .eq('is_active', true);
  active360 = qs?.length || 0;
  const scored = (qs || []).filter((q) => q.question_type === 'scored').length;
  pass('Q3 streamlined 360 bank live', active360 === 24 && scored === 21, `active=${active360} scored=${scored}`);
}

const { count: q3Draft } = await admin
  .from('assessment_responses')
  .select('id', { count: 'exact', head: true })
  .eq('period', q)
  .eq('status', 'draft');
const { data: peerFormRow } = await admin.from('assessment_forms').select('id').eq('code', 'peer_360').maybeSingle();
let q3Submitted = 0;
if (peerFormRow) {
  const { count } = await admin
    .from('assessment_responses')
    .select('id', { count: 'exact', head: true })
    .eq('form_id', peerFormRow.id)
    .eq('period', q)
    .eq('status', 'submitted');
  q3Submitted = count || 0;
}
console.log(`INFO  Q3 peer_360: submitted=${q3Submitted}, draft shells=${q3Draft ?? '?'}`);

const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (password) {
  const ref = 'qnorggoycwbbxdlvbcvq';
  const client = new pg.Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const m = await client.query(`
      SELECT version FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260924120000', '20260924130000')
      ORDER BY version
    `);
    pass('Q3 360 migrations applied', m.rows.length === 2, m.rows.map((r) => r.version).join(', ') || 'missing');

    const fn = await client.query(`
      SELECT proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND proname = 'boom_360_feedback_bucket'
    `);
    pass('Dashboard theme bucketing function', fn.rows.length === 1);

    await client.end();
  } catch (err) {
    console.log(`WARN  DB checks skipped: ${err.message}`);
  }
} else {
  console.log('WARN  SUPABASE_DB_PASSWORD unset — skipping migration verify');
}

// Sample task RPC for one active employee
if (active[0]?.id) {
  const { error: tErr } = await admin.rpc('get_review_assignments', {
    _period_quarter: q,
    _period_month: month,
  });
  pass('get_review_assignments RPC callable', !tErr, tErr?.message || 'ok (runs as service role, not user-scoped)');
}

const demoDoc = existsSync(join(projectRoot(), 'docs/eo-pilot-team-guide.md'));
if (demoDoc) {
  const txt = readFileSync(join(projectRoot(), 'docs/eo-pilot-team-guide.md'), 'utf8');
  const hasDemoPw = txt.includes('BoomEoDemo2026!');
  if (hasDemoPw) console.log('WARN  Pilot guide still publishes shared demo password — not production-grade auth hygiene');
}

const fail = checks.filter((c) => !c.ok).length;
console.log(`\n=== ${checks.length - fail}/${checks.length} checks passed ===\n`);
process.exit(fail ? 1 : 0);
