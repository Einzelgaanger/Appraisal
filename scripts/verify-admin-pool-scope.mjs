/**
 * Confirm the admin monitor RPCs only return the caller's own pool.
 * Signs in as the VigiPay admin and (if available) a GHC admin.
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const now = new Date();
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const quarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Ground truth straight from the table.
for (const [label, col] of [['vigipay', 'vigipay_appraisal_active'], ['ghc', 'ghc_appraisal_active']]) {
  const { count } = await admin.from('employees').select('id', { count: 'exact', head: true }).eq(col, true);
  console.log(`actual ${label} roster: ${count}`);
}

const accounts = [['VigiPay admin', 'oluseyi.oluwabusola@venturegardengroup.com', 'VigiPayDemo2026!']];

for (const [label, email, password] of accounts) {
  const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: sErr } = await c.auth.signInWithPassword({ email, password });
  if (sErr) {
    console.log(`\n${label}: SIGN-IN FAILED ${sErr.message}`);
    continue;
  }

  const { data: summary, error: e1 } = await c.rpc('ghc_admin_completion_summary', {
    _period_quarter: quarter,
    _period_month: month,
  });
  const { data: evals, error: e2 } = await c.rpc('ghc_admin_list_evaluations', { _period_quarter: quarter });

  console.log(`\n${label} (${email})`);
  console.log(`  summary: ${e1 ? `ERROR ${e1.message}` : JSON.stringify(summary)}`);
  if (e2) console.log(`  evaluations: ERROR ${e2.message}`);
  else {
    console.log(`  evaluations: ${evals.length} row(s)`);
    for (const ev of evals) console.log(`      - ${ev.employee_name} via ${ev.manager_name} (${ev.status})`);
  }

  await c.auth.signOut();
}
