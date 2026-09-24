/**
 * Sign in as each VigiPay demo user through the public anon client and confirm the
 * hub's RPCs resolve them into the VigiPay pool. Read-only apart from the sign-in.
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const PASSWORD = 'VigiPayDemo2026!';
const EMAILS = [
  'oluseyi.oluwabusola@venturegardengroup.com',
  'lawal.abdulateef@venturegardengroup.com',
  'marcia.cole@venturegardengroup.com',
];

for (const email of EMAILS) {
  const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signIn, error: sErr } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) {
    console.log(`\n${email}\n  SIGN-IN FAILED: ${sErr.message}`);
    continue;
  }
  console.log(`\n${email}\n  sign-in OK (user ${signIn.user.id})`);

  const { data: profile } = await c.from('profiles').select('name,role,employee_id,profile_completed').eq('id', signIn.user.id).maybeSingle();
  console.log(`  profile: ${profile?.name} / ${profile?.role} / completed=${profile?.profile_completed} / employee_id=${profile?.employee_id ? 'set' : 'MISSING'}`);

  const { data: lock } = await c.from('employees').select('locked_tenant_slug,company_admin').eq('id', profile?.employee_id).maybeSingle();
  console.log(`  lock: ${lock?.locked_tenant_slug} / company_admin=${!!lock?.company_admin}`);

  for (const fn of ['ghc_me', 'ghc_is_admin']) {
    const { data, error } = await c.rpc(fn);
    console.log(`  ${fn}: ${error ? `ERROR ${error.message}` : JSON.stringify(data)}`);
  }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const quarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;

  const calls = [
    ['ghc_get_my_tasks', { _period_month: month, _period_quarter: quarter }],
    ['ghc_get_directory_status', { _period_quarter: quarter, _period_month: month }],
  ];
  for (const [fn, args] of calls) {
    const { data, error } = await c.rpc(fn, args);
    if (error) console.log(`  ${fn}: ERROR ${error.message}`);
    else {
      const n = Array.isArray(data) ? data.length : null;
      console.log(`  ${fn}(${month}/${quarter}): ${n === null ? JSON.stringify(data).slice(0, 120) : `${n} row(s)`}`);
      if (n && fn === 'ghc_get_my_tasks') {
        for (const t of data.slice(0, 6)) console.log(`      - ${t.kind ?? t.task_kind} :: ${t.subject_name ?? ''} :: ${t.status}`);
      }
    }
  }

  await c.auth.signOut();
}
