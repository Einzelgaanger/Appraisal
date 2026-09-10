/**
 * End-to-end GHC production audit against designed process.
 * Usage: node scripts/audit-ghc-production.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const env = loadEnv();
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks = [];
function pass(label, ok, detail = '') {
  checks.push({ label, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const month = new Date().toISOString().slice(0, 7);
const q = (() => {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
})();

console.log(`\n=== GHC production audit (${month} / ${q}) ===\n`);

// 1) Roster / hierarchy
const { data: roster } = await admin
  .from('employees')
  .select('id,name,email,ghc_appraisal_active,ghc_hierarchy_level,ghc_manager_id,ghc_secondary_manager_id')
  .eq('ghc_appraisal_active', true)
  .order('ghc_hierarchy_level');
pass('Active roster is 9', roster?.length === 9, `count=${roster?.length}`);

const byLocal = (part) => roster?.find((e) => (e.email || '').split('@')[0].toLowerCase() === part);
const bunmi = byLocal('bunmi.akinyemiju');
const uloma = byLocal('uloma.herrington');
const busayo = byLocal('busayo.eniola-giwa');
const omotola = byLocal('omotola.akinyemiju');
const phebean = byLocal('phebean.falaye');
const mariam = byLocal('mariam.adahunse');
const faith = byLocal('faith.aminaho');
const anjola = byLocal('anjolaoluwa.jawando');

pass('Uloma → Bunmi', uloma?.ghc_manager_id === bunmi?.id);
pass('Busayo/Omotola/Phebean → Uloma', [busayo, omotola, phebean].every((p) => p?.ghc_manager_id === uloma?.id));
pass('Mariam dual Busayo+Omotola', mariam?.ghc_manager_id === busayo?.id && mariam?.ghc_secondary_manager_id === omotola?.id);
pass('Faith → Phebean', faith?.ghc_manager_id === phebean?.id);
pass('Anjola → Omotola', anjola?.ghc_manager_id === omotola?.id);

// 2) Profiles linked
const { data: profiles } = await admin.from('profiles').select('id,email,employee_id');
const linked = (roster || []).filter((e) => (profiles || []).some((p) => p.employee_id === e.id));
pass('Every active person has login profile', linked.length === (roster?.length || 0), `${linked.length}/${roster?.length}`);

// 3) RPC presence
for (const fn of [
  'ghc_get_my_tasks',
  'ghc_upsert_monthly_review',
  'ghc_upsert_360',
  'ghc_upsert_quarterly_evaluation',
  'ghc_acknowledge_evaluation',
  'ghc_get_my_360_aggregate',
  'ghc_release_period',
  'ghc_get_directory_status',
  'ghc_create_notification',
  'ghc_get_my_notifications',
]) {
  const { error } = await admin.rpc(fn, fn.includes('tasks')
    ? { _period_month: month, _period_quarter: q }
    : fn.includes('directory') || fn.includes('admin')
      ? { _period_quarter: q, _period_month: month }
      : fn.includes('360_aggregate') || fn.includes('evaluations')
        ? { _period_quarter: q }
        : fn.includes('notifications')
          ? { _limit: 1 }
          : fn.includes('release')
            ? { _kind: 'peer_360', _period: q }
            : {});
  // service role may fail auth-sensitive RPCs — existence vs permission
  const missing = /Could not find the function|schema cache/i.test(error?.message || '');
  pass(`RPC exists: ${fn}`, !missing, error && !missing ? `callable/perm: ${error.message.slice(0, 80)}` : 'ok');
}

// 4) Live task matrix as each user
async function asUser(email, fn) {
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const hashed = link?.properties?.hashed_token;
  const { error: vErr } = await anon.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
  if (vErr) throw vErr;
  try {
    return await fn(anon);
  } finally {
    await anon.auth.signOut();
  }
}

const expected = {
  [uloma.email]: { monthly: 4, eval: 4, peer: 8 },
  [bunmi.email]: { monthly: 1, eval: 1, peer: 8 },
  [omotola.email]: { monthly: 2, eval: 2, peer: 8 },
  [faith.email]: { monthly: 0, eval: 0, peer: 8 },
};

for (const [email, exp] of Object.entries(expected)) {
  try {
    await asUser(email, async (client) => {
      const { data: tasks, error } = await client.rpc('ghc_get_my_tasks', {
        _period_month: month,
        _period_quarter: q,
      });
      if (error) throw error;
      const list = Array.isArray(tasks) ? tasks : [];
      const c = (k) => list.filter((t) => t.kind === k).length;
      pass(
        `Tasks for ${email.split('@')[0]}`,
        c('monthly_manager') === exp.monthly && c('quarterly_evaluation') === exp.eval && c('peer_360') === exp.peer,
        `monthly=${c('monthly_manager')} eval=${c('quarterly_evaluation')} 360=${c('peer_360')}`,
      );
    });
  } catch (e) {
    pass(`Tasks for ${email.split('@')[0]}`, false, e.message);
  }
}

// 5) End-to-end write: Uloma monthly draft+submit for Faith? Faith reports to Phebean. Use Busayo for Mariam.
try {
  await asUser(busayo.email, async (client) => {
    const { data: rid, error } = await client.rpc('ghc_upsert_monthly_review', {
      _payload: {
        report_id: mariam.id,
        period: month,
        status: 'submitted',
        proud_this_month: true,
        personal_issues: false,
        company_can_help: false,
        motivated: true,
        motivated_why: 'Audit submit',
        fulfilled: 'yes',
        fulfilled_how: 'Audit',
        time_off_this_quarter: false,
        looking_forward_personal: true,
        looking_forward_work: true,
        meeting_okrs: true,
        displaying_growth: true,
        strong_relationship: true,
        culture_founders_lps: 4,
        culture_curious: 4,
        culture_move_fast: 4,
        culture_overachievement: 4,
        culture_job_done: 4,
        feedback_to_report: 'Audit feedback',
        feedback_from_report: 'Audit reply',
      },
    });
    if (error) throw error;
    pass('Manager can submit monthly review', !!rid, String(rid));

    const { data: notifs } = await admin
      .from('ghc_notifications')
      .select('id,title,event_type')
      .eq('recipient_employee_id', mariam.id)
      .eq('event_type', 'monthly_review_submitted')
      .order('created_at', { ascending: false })
      .limit(1);
    pass('Monthly submit creates in-app notification', (notifs || []).length > 0, notifs?.[0]?.title);
  });
} catch (e) {
  pass('Manager can submit monthly review', false, e.message);
}

// 6) Quarterly eval + acknowledge visibility
try {
  await asUser(busayo.email, async (client) => {
    const { data: eid, error } = await client.rpc('ghc_upsert_quarterly_evaluation', {
      _payload: {
        employee_id: mariam.id,
        period: q,
        status: 'submitted',
        review_type: 'Q3',
        score_technical: 4,
        score_founders_lps: 4,
        score_curious: 4,
        score_move_fast: 4,
        score_overachievement: 4,
        score_job_done: 4,
        score_growth: 4,
        comment_technical: 'Audit',
        strengths: ['A', 'B', 'C'],
        improvements: ['D'],
        improvement_goals: [{ area: 'Growth', goal: 'Ship', indicator: 'OKR', timeline: 'Q4', reviewer: 'Busayo' }],
      },
    });
    if (error) throw error;
    pass('Manager can submit quarterly evaluation', !!eid, String(eid));
  });

  await asUser(mariam.email, async (client) => {
    const { data: tasks, error } = await client.rpc('ghc_get_my_tasks', {
      _period_month: month,
      _period_quarter: q,
    });
    if (error) throw error;
    const ack = (Array.isArray(tasks) ? tasks : []).filter((t) => t.kind === 'acknowledge_evaluation');
    pass('Report sees acknowledge task after submit', ack.length >= 1, `ack=${ack.length}`);
  });
} catch (e) {
  pass('Eval submit → acknowledge flow', false, e.message);
}

// 7) Hardening RPC presence (may not be applied yet)
{
  const { error } = await admin.rpc('ghc_get_my_evaluations', { _period_quarter: q });
  const missing = /Could not find the function|schema cache/i.test(error?.message || '');
  pass('Hardening RPC ghc_get_my_evaluations applied', !missing, error?.message?.slice(0, 100) || 'present');
}

console.log('\n=== Summary ===');
const failed = checks.filter((c) => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.log('Failures:');
  for (const f of failed) console.log(`  - ${f.label}: ${f.detail}`);
  process.exit(1);
}
