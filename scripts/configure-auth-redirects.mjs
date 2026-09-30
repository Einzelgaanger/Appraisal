/**
 * Point Supabase Auth at the real production hosts.
 *
 * Password reset links are built from `redirectTo`, but Supabase only honours a
 * redirect that is on the project allow-list — anything else silently falls back
 * to the Site URL. With the Site URL left at http://localhost:3000 every reset
 * email in production sends people to their own machine.
 *
 * Run with no flags for a read-only report, `--apply` to write the fix.
 * Needs SUPABASE_ACCESS_TOKEN (Supabase dashboard → Account → Access Tokens).
 */
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const REF = 'qnorggoycwbbxdlvbcvq';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set. Add it to .env and re-run.');
  process.exit(1);
}

// Site URL: neutral fallback when redirect_to does not match the allow-list (product apex, not a tenant host).
const SITE_URL = 'https://vgg.tools';

// Explicit tenant hosts + wildcards + Render default host + local dev (src/tenants/config.ts).
const ALLOW_LIST = [
  'https://executive.vgg.tools/**',
  'https://ghc.vgg.tools/**',
  'https://vigipay.vgg.tools/**',
  'https://vgg.tools/**',
  'https://*.vgg.tools/**',
  'https://three60appraisal.onrender.com/**',
  'http://localhost:8080/**',
].join(',');

const api = async (method, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
};

const report = (config, label) => {
  console.log(`\n== ${label}`);
  console.log(`  site_url:        ${config.site_url}`);
  console.log(`  uri_allow_list:  ${config.uri_allow_list || '(empty)'}`);
  console.log(`  custom SMTP:     ${config.smtp_host ? `${config.smtp_host} as ${config.smtp_admin_email}` : 'NOT CONFIGURED — built-in mailer, rate limited'}`);
  console.log(`  recovery expiry: ${config.mailer_otp_exp}s`);
  console.log(`  send-email hook: ${config.hook_send_email_enabled ? config.hook_send_email_uri : 'disabled'}`);
};

report(await api('GET'), 'current');

if (!process.argv.includes('--apply')) {
  console.log('\nRead-only. Re-run with --apply to write:');
  console.log(`  site_url       -> ${SITE_URL}`);
  console.log(`  uri_allow_list -> ${ALLOW_LIST}`);
  process.exit(0);
}

await api('PATCH', { site_url: SITE_URL, uri_allow_list: ALLOW_LIST });
report(await api('GET'), 'after apply');
