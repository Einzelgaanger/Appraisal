/**
 * Verify the live peer_360 question bank after the Q3 2026 streamlining:
 * active set composition, archived count, and narrative bucket mapping.
 *
 * Usage: node scripts/verify-peer360-q3-set.mjs
 */
import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const { Client } = pg;
const ref = 'qnorggoycwbbxdlvbcvq';
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD');
  process.exit(1);
}
const encoded = encodeURIComponent(password);
const hosts = ['aws-1-eu-west-1.pooler.supabase.com', 'aws-0-eu-west-1.pooler.supabase.com'];

let client;
for (const host of hosts) {
  const c = new Client({
    connectionString: `postgresql://postgres.${ref}:${encoded}@${host}:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await c.connect();
    client = c;
    break;
  } catch {
    try { await c.end(); } catch { /* ignore */ }
  }
}
if (!client) process.exit(1);

const counts = await client.query(`
  SELECT q.is_active, q.question_type, q.audience, COUNT(*)::int AS n
  FROM public.assessment_questions q
  JOIN public.assessment_forms f ON f.id = q.form_id
  WHERE f.code = 'peer_360'
  GROUP BY 1, 2, 3
  ORDER BY 1 DESC, 2, 3
`);
console.log('--- peer_360 question bank ---');
for (const r of counts.rows) {
  console.log(`${r.is_active ? 'ACTIVE  ' : 'archived'} ${r.question_type.padEnd(8)} ${r.audience.padEnd(13)} ${r.n}`);
}

const active = await client.query(`
  SELECT q.section_order, q.section, q.sort_order, q.question_type, q.audience,
         public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) AS bucket,
         left(q.question_text, 72) AS preview
  FROM public.assessment_questions q
  JOIN public.assessment_forms f ON f.id = q.form_id
  WHERE f.code = 'peer_360' AND q.is_active
  ORDER BY q.section_order, q.sort_order
`);
console.log('\n--- active set served for new responses ---');
for (const r of active.rows) {
  const tag = r.audience === 'manager_only' ? ' [mgr]' : '';
  const bucket = r.bucket ? ` -> ${r.bucket}` : '';
  console.log(`${r.section_order}.${r.sort_order} ${r.section}${tag}: ${r.preview}…${bucket}`);
}

// Any active scored item leaking into a narrative theme bucket is a bug.
const leaks = await client.query(`
  SELECT COUNT(*)::int AS n
  FROM public.assessment_questions q
  JOIN public.assessment_forms f ON f.id = q.form_id
  WHERE f.code = 'peer_360' AND q.is_active AND q.question_type = 'scored'
    AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) IS NOT NULL
`);
console.log(`\nScored items mis-bucketed into narrative themes: ${leaks.rows[0].n}`);

const q3 = await client.query(`
  SELECT COUNT(*)::int AS n
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE f.code = 'peer_360' AND r.period = '2026-Q3'
`);
console.log(`Existing 2026-Q3 peer_360 responses: ${q3.rows[0].n}`);

await client.end();
process.exit(0);
