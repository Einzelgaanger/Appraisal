/**
 * Turn on branded auth mail.
 *
 * Requires RESEND_API_KEY in .env (Resend → API Keys). The key is not printed.
 * Verifies a sending domain, stores the hook secret, and points Supabase Auth
 * at auth-email-hook so password reset and invite stop using the default
 * Supabase template.
 *
 *   node scripts/enable-branded-auth-email.mjs
 */
import { randomBytes } from 'crypto';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const REF = 'qnorggoycwbbxdlvbcvq';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const resendKey = process.env.RESEND_API_KEY?.trim();

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}
if (!resendKey) {
  console.error('Missing RESEND_API_KEY in .env.');
  console.error('The send-email hook is still off, so Auth is using the built-in Supabase mailer.');
  console.error('Add the key, then run this script again.');
  process.exit(1);
}

const domainsRes = await fetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${resendKey}` },
});
const domainsBody = await domainsRes.text();
if (!domainsRes.ok) {
  console.error(`Resend domains request failed (${domainsRes.status}). Check the API key.`);
  process.exit(1);
}
const domains = JSON.parse(domainsBody).data || [];
for (const domain of domains) {
  console.log(`domain ${domain.name} ${domain.status}`);
}
const verified = domains.filter((domain) => domain.status === 'verified');
if (!verified.length) {
  console.error('No verified Resend domain. Add and verify vgg.tools (or notify.vgg.tools) in Resend, then rerun.');
  process.exit(1);
}
const preferred = verified.find((domain) => domain.name === 'vgg.tools')
  || verified.find((domain) => domain.name === 'notify.vgg.tools')
  || verified[0];
console.log(`sending from noreply@${preferred.name}`);

const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET?.trim()
  || `v1,whsec_${randomBytes(32).toString('base64')}`;

const secretRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([
    { name: 'RESEND_API_KEY', value: resendKey },
    { name: 'RESEND_FROM_DOMAIN', value: preferred.name },
    { name: 'SEND_EMAIL_HOOK_SECRET', value: hookSecret },
  ]),
});
if (!secretRes.ok) {
  console.error(`Could not store function secrets (${secretRes.status}).`);
  process.exit(1);
}
console.log('Stored Resend key and hook secret on the project.');

const hookRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hook_send_email_enabled: true,
    hook_send_email_uri: `https://${REF}.supabase.co/functions/v1/auth-email-hook`,
    hook_send_email_secrets: hookSecret,
    rate_limit_email_sent: 100,
  }),
});
const hookText = await hookRes.text();
if (!hookRes.ok) {
  console.error(`Could not enable the send-email hook (${hookRes.status}).`);
  console.error(hookText.slice(0, 400));
  process.exit(1);
}
console.log('Send-email hook enabled. Auth mail now goes through the branded templates.');
