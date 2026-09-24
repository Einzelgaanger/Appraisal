/**
 * Inspect 2026-Q3 peer_360 responses: status, whether any answers exist, and
 * whether those answers point at the archived (pre-streamlining) question bank.
 *
 * Usage: node scripts/check-peer360-q3-progress.mjs
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

const byStatus = await client.query(`
  SELECT r.status, COUNT(*)::int AS responses,
         COUNT(*) FILTER (WHERE ans.n > 0)::int AS with_answers,
         COALESCE(SUM(ans.n), 0)::int AS total_answers
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS n FROM public.assessment_answers a WHERE a.response_id = r.id
  ) ans ON true
  WHERE f.code = 'peer_360' AND r.period = '2026-Q3'
  GROUP BY r.status
  ORDER BY r.status
`);
console.log('--- 2026-Q3 peer_360 responses ---');
for (const r of byStatus.rows) {
  console.log(`${r.status.padEnd(10)} responses=${r.responses}  with_answers=${r.with_answers}  answer_rows=${r.total_answers}`);
}

const bank = await client.query(`
  SELECT q.is_active, COUNT(*)::int AS answer_rows,
         COUNT(*) FILTER (WHERE a.score IS NOT NULL)::int AS scored,
         COUNT(*) FILTER (WHERE public.boom_meaningful_text_answer(a.text_answer))::int AS written
  FROM public.assessment_answers a
  JOIN public.assessment_questions q ON q.id = a.question_id
  JOIN public.assessment_responses r ON r.id = a.response_id
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE f.code = 'peer_360' AND r.period = '2026-Q3'
  GROUP BY q.is_active
`);
console.log('\n--- Q3 answers by question bank ---');
if (bank.rows.length === 0) console.log('none');
for (const r of bank.rows) {
  console.log(`${r.is_active ? 'current set' : 'ARCHIVED set'}: answer_rows=${r.answer_rows} scored=${r.scored} written=${r.written}`);
}

const subjects = await client.query(`
  SELECT e.name AS reviewee, COUNT(*)::int AS submitted_reviews,
         MIN(r.submitted_at)::date AS first_submitted, MAX(r.submitted_at)::date AS last_submitted
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'peer_360'
  JOIN public.employees e ON e.id = r.reviewee_id
  WHERE r.period = '2026-Q3' AND r.status = 'submitted'
  GROUP BY e.name
  ORDER BY 2 DESC, 1
`);
console.log('\n--- who already has submitted Q3 reviews (old bank) ---');
console.table(subjects.rows);

const periods = await client.query(`
  SELECT r.period, r.status, COUNT(*)::int AS n
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE f.code = 'peer_360'
  GROUP BY r.period, r.status
  ORDER BY r.period, r.status
`);
console.log('\n--- all peer_360 periods ---');
for (const r of periods.rows) console.log(`${r.period}  ${r.status.padEnd(10)} ${r.n}`);

const legacy = await client.query(`
  SELECT r.period, COUNT(DISTINCT r.id)::int AS responses, COUNT(a.id)::int AS answer_rows,
         COUNT(a.score)::int AS scored,
         COUNT(*) FILTER (WHERE public.boom_meaningful_text_answer(a.text_answer))::int AS written
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'peer_360'
  LEFT JOIN public.assessment_answers a ON a.response_id = r.id
  WHERE r.period = '2026-Q3-legacy'
  GROUP BY r.period
`);
console.log('\n--- archived Q3 reviews still intact ---');
console.table(legacy.rows);

const disc = await client.query(`
  SELECT d.period, COUNT(*)::int AS discussions
  FROM public.boom_result_discussions d
  WHERE d.form_code = 'peer_360' AND d.period LIKE '2026-Q3%'
  GROUP BY d.period ORDER BY d.period
`);
console.log('\n--- peer_360 result discussions ---');
console.table(disc.rows);

await client.end();
process.exit(0);
