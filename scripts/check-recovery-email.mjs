import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url) {
  console.error('Missing SUPABASE_URL');
  process.exit(1);
}

async function main() {
  if (serviceKey) {
    const sb = createClient(url, serviceKey);
    const { data, error } = await sb
      .from('email_send_log')
      .select('template_name, status, recipient_email, created_at, error_message')
      .eq('template_name', 'recovery')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('=== Recent recovery emails (email_send_log) ===');
    if (error) {
      console.log('Query error:', error.message);
    } else if (!data?.length) {
      console.log('No recovery rows found');
    } else {
      for (const r of data) {
        console.log(`${r.created_at} | ${r.status} | ${r.recipient_email} | ${r.error_message ?? ''}`);
      }
    }

    const { data: allRecovery } = await sb
      .from('email_send_log')
      .select('status')
      .eq('template_name', 'recovery');
    const counts = {};
    for (const r of allRecovery ?? []) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    console.log('Recovery totals by status:', counts);

    const { data: recent } = await sb
      .from('email_send_log')
      .select('template_name, status, recipient_email, created_at')
      .order('created_at', { ascending: false })
      .limit(12);
    console.log('\n=== All recent email_send_log ===');
    for (const r of recent ?? []) {
      console.log(`${r.created_at} | ${r.template_name} | ${r.status} | ${r.recipient_email}`);
    }

    for (const q of ['auth_emails', 'transactional_emails']) {
      const { count, error: qErr } = await sb
        .schema('pgmq')
        .from(`q_${q}`)
        .select('*', { count: 'exact', head: true });
      console.log(`Queue ${q}:`, qErr ? `unavailable (${qErr.message})` : `${count ?? 0} messages`);
    }

    const { data: state } = await sb.from('email_send_state').select('*').single();
    console.log('\nemail_send_state:', state);

    const diagId = crypto.randomUUID();
    const { error: enqErr } = await sb.rpc('enqueue_email', {
      queue_name: 'auth_emails',
      payload: {
        run_id: 'diag-pipeline-test',
        message_id: diagId,
        to: 'diag-pipeline@venturegardengroup.com',
        from: 'VGG 360° Appraisal <noreply@vgg.tools>',
        sender_domain: 'notify.vgg.tools',
        subject: 'Pipeline diag (do not deliver)',
        html: '<p>diag</p>',
        text: 'diag',
        purpose: 'transactional',
        label: 'recovery',
        queued_at: new Date().toISOString(),
      },
    });
    console.log('\nenqueue_email test:', enqErr ? enqErr.message : 'ok');

    const procRes = await fetch(`${url}/functions/v1/process-email-queue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const procBody = await procRes.text();
    console.log('process-email-queue:', procRes.status, procBody);

    const { data: diagLogs } = await sb
      .from('email_send_log')
      .select('status, error_message, template_name, recipient_email')
      .eq('message_id', diagId);
    console.log('diag pipeline log:', diagLogs);

    const { data: batch, error: batchErr } = await sb.rpc('read_email_batch', {
      queue_name: 'auth_emails',
      batch_size: 5,
      vt: 1,
    });
    console.log('\nauth_emails queue peek:', batchErr?.message ?? `${batch?.length ?? 0} message(s)`);
    if (batch?.length) {
      console.log('  first labels:', batch.map((m) => m.message?.label ?? m.message?.to));
    }

    for (const [name, opts] of [
      ['auth-email-hook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
      ['process-email-queue', { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}` } }],
    ]) {
      const r = await fetch(`${url}/functions/v1/${name}`, opts);
      const body = await r.text();
      console.log(`\n${name} probe:`, r.status, body.slice(0, 180));
    }
  } else {
    console.log('No SUPABASE_SERVICE_ROLE_KEY — skipping email_send_log');
  }

  if (anonKey && !process.argv.includes('--skip-reset')) {
    const pub = createClient(url, anonKey);
    const testEmail = process.argv[2] || 'bunmi.akinyemiju@peopleos.co';
    const { error } = await pub.auth.resetPasswordForEmail(testEmail, {
      redirectTo: 'https://executive.vgg.tools/reset-password',
    });
    console.log(`\n=== resetPasswordForEmail (${testEmail}) ===`);
    console.log(error ? `Error: ${error.message}` : 'OK — Supabase accepted the request');
    if (!error && serviceKey) {
      console.log('Waiting 8s for hook + queue processor…');
      await new Promise((r) => setTimeout(r, 8000));
      const sb2 = createClient(url, serviceKey);
      const { data: after } = await sb2
        .from('email_send_log')
        .select('template_name, status, recipient_email, created_at, error_message')
        .eq('recipient_email', testEmail)
        .order('created_at', { ascending: false })
        .limit(5);
      console.log('Log rows for recipient after test:');
      for (const r of after ?? []) {
        console.log(`  ${r.created_at} | ${r.template_name} | ${r.status} | ${r.error_message ?? ''}`);
      }
      if (!after?.length) console.log('  (none — auth hook may not be firing or cron not processing)');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
