/**
 * Diagnose the production password-reset path: is the auth email hook firing,
 * is anything queued, and is a dispatcher scheduled? Read-only.
 */
import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const { Client } = pg;
const ref = 'qnorggoycwbbxdlvbcvq';
const encoded = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim());
const hosts = ['aws-1-eu-west-1.pooler.supabase.com', 'aws-0-eu-west-1.pooler.supabase.com'];

let client;
for (const host of hosts) {
  const c = new Client({
    connectionString: `postgresql://postgres.${ref}:${encoded}@${host}:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  try { await c.connect(); client = c; break; } catch { try { await c.end(); } catch { /* ignore */ } }
}
if (!client) { console.error('no db connection'); process.exit(1); }

const q = async (label, sql) => {
  try {
    const r = await client.query(sql);
    console.log(`\n== ${label}`);
    console.table(r.rows);
    return r.rows;
  } catch (e) {
    console.log(`\n== ${label}\n   ERROR: ${e.message}`);
    return null;
  }
};

await q('email_send_log — most recent 15', `
  SELECT template_name, recipient_email, status, error_message, created_at
  FROM public.email_send_log ORDER BY created_at DESC LIMIT 15`);

await q('email_send_log — counts by template/status', `
  SELECT template_name, status, count(*)::int AS n, max(created_at) AS latest
  FROM public.email_send_log GROUP BY 1,2 ORDER BY 1,2`);

await q('pgmq queues present', `
  SELECT queue_name FROM pgmq.list_queues()`);

await q('auth_emails queue depth', `
  SELECT count(*)::int AS queued FROM pgmq.q_auth_emails`);

await q('scheduled cron jobs', `
  SELECT jobid, schedule, jobname, active, left(command, 90) AS command
  FROM cron.job ORDER BY jobid`);

await q('recent cron runs', `
  SELECT jobid, status, return_message, start_time
  FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10`);

await q('auth users created recently (activation signal)', `
  SELECT email, created_at, last_sign_in_at, recovery_sent_at, confirmation_sent_at
  FROM auth.users ORDER BY coalesce(recovery_sent_at, created_at) DESC LIMIT 10`);

await client.end();
