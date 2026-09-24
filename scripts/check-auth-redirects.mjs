/**
 * Check whether each tenant host is on the Supabase redirect allow-list.
 *
 * generateLink() returns the link WITHOUT sending an email. If a requested
 * redirect_to is not allow-listed, Supabase silently substitutes the Site URL —
 * comparing the two tells us exactly which hosts are configured.
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A demo account we created, so nothing real is touched.
const EMAIL = 'oluseyi.oluwabusola@venturegardengroup.com';

const TARGETS = [
  'https://vigipay.vgg.tools/reset-password?tenant=vigipay',
  'https://ghc.vgg.tools/reset-password?tenant=ghc',
  'https://executive.vgg.tools/reset-password?tenant=executiveteam',
  'https://vgg.tools/reset-password',
  'http://localhost:8080/reset-password',
];

for (const redirectTo of TARGETS) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: EMAIL,
    options: { redirectTo },
  });
  if (error) {
    console.log(`\nrequested: ${redirectTo}\n  ERROR ${error.message}`);
    continue;
  }
  const link = data?.properties?.action_link ?? '';
  const got = new URL(link).searchParams.get('redirect_to');
  const ok = got === redirectTo;
  console.log(`\nrequested: ${redirectTo}`);
  console.log(`  returned: ${got}`);
  console.log(`  ${ok ? 'ALLOW-LISTED' : 'NOT ALLOW-LISTED — Supabase fell back to the Site URL'}`);
}

// Also surface what the built-in mailer thinks it is.
const res = await fetch(`${process.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
  headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY },
});
console.log('\nauth settings (public):', JSON.stringify(await res.json(), null, 1));
