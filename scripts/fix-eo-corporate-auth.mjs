/**
 * Audit + fix EO pilot emails: sync employees to corporate emails,
 * ensure auth users + profiles exist for every active EO person.
 *
 * Run: node scripts/fix-eo-corporate-auth.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const EO = '11111111-1111-1111-1111-111111111111';
const DEMO_PW = env.DEMO_DEFAULT_PASSWORD || 'BoomEoDemo2026!';
const s = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** peopleos / known aliases → corporate login email */
const EMAIL_MAP = {
  'eniola.olawale@peopleos.co': 'eniola.olawale@venturegardengroup.com',
  'kunmi.demuren@peopleos.co': 'kunmi.demuren@venturegardengroup.com',
  'bunmi.akinyemiju@peopleos.co': 'bunmi.akinyemiju@peopleos.co', // Bunmi stays on peopleos by design
  'demola.idowu@peopleos.co': 'demola.idowu@venturegardengroup.com',
  'uche.ukonu@peopleos.co': 'uche.ukonu@venturegardengroup.com',
  'omotola.akinyemiju@peopleos.co': 'omotola.akinyemiju@venturegardengroup.com',
  'gisele.karekezi@peopleos.co': 'gisele.karakezi@venturegardengroup.com',
  'gisele.karakezi@peopleos.co': 'gisele.karakezi@venturegardengroup.com',
  'deyi.dipeolu@peopleos.co': 'deyi.dipeolu@venturegardengroup.com',
  'tobi.bankole@peopleos.co': 'tobi.bankole@venturegardengroup.com',
  'dorathy.akor@peopleos.co': 'dorathy.akor@venturegardengroup.com',
  'ayomide.adeosun@peopleos.co': 'adeosun.ayomide@venturegardengroup.com',
  'adeosun.ayomide@peopleos.co': 'adeosun.ayomide@venturegardengroup.com',
  'brenda.nafula@peopleos.co': 'brenda.nafula@vgplatform.com',
  'oluwatobi.ijamakinwa@peopleos.co': 'oluwatobiloba.ijamakinwa@venturegardengroup.com',
  'oluwatobiloba.ijamakinwa@peopleos.co': 'oluwatobiloba.ijamakinwa@venturegardengroup.com',
  'gideon.abiona@peopleos.co': 'gideon.abiona@venturegardengroup.com',
  'chukwuka.monyei@peopleos.co': 'chukwuka.monyei@venturegardengroup.com',
  'melissa.omede@peopleos.co': 'melissa.omede@venturegardengroup.com',
  'baluku.dounnah@peopleos.co': 'baluku.dounnah@venturegardengroup.com',
  'regina.ottoh-ebhonu@peopleos.co': 'regina.ottoh-ebhonu@venturegardengroup.com',
  'favour.oyekanmi@peopleos.co': 'favour.oyekanmi@venturegardengroup.com',
  'ekemudeme.iriyang@peopleos.co': 'ekemudeme.iriyang@venturegardengroup.com',
  'udeme.inyang@peopleos.co': 'ekemudeme.iriyang@venturegardengroup.com',
  'adeyinka.oshin@peopleos.co': 'adeyinka.oshin@venturegardengroup.com',
};

function canonical(email) {
  const e = (email || '').toLowerCase().trim();
  return EMAIL_MAP[e] || e;
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await s.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...(data?.users ?? []));
    if ((data?.users?.length ?? 0) < 200) break;
    page += 1;
  }
  return users;
}

const { data: employees, error: empErr } = await s
  .from('employees')
  .select('id,name,email,eo_appraisal_active,hierarchy_level')
  .eq('subsidiary_id', EO)
  .eq('eo_appraisal_active', true)
  .order('name');

if (empErr) throw empErr;

console.log(`Active EO employees: ${employees.length}`);

const authUsers = await listAllAuthUsers();
const byAuthEmail = new Map(authUsers.map((u) => [u.email?.toLowerCase(), u]));

const report = { emailFixed: [], authCreated: [], authUpdated: [], alreadyOk: [], issues: [] };

for (const emp of employees) {
  const oldEmail = (emp.email || '').toLowerCase().trim();
  const newEmail = canonical(oldEmail);

  if (oldEmail !== newEmail) {
    const { error } = await s.from('employees').update({ email: newEmail }).eq('id', emp.id);
    if (error) {
      report.issues.push(`${emp.name}: email update failed — ${error.message}`);
      continue;
    }
    report.emailFixed.push(`${emp.name}: ${oldEmail} → ${newEmail}`);
    emp.email = newEmail;
  }

  const login = newEmail;
  let user =
    byAuthEmail.get(login) ||
    byAuthEmail.get(oldEmail) ||
    authUsers.find((u) => u.user_metadata?.employee_id === emp.id);

  if (!user) {
    const { data: created, error: cErr } = await s.auth.admin.createUser({
      email: login,
      password: DEMO_PW,
      email_confirm: true,
      user_metadata: { name: emp.name },
    });
    if (cErr) {
      report.issues.push(`${emp.name}: create auth failed — ${cErr.message}`);
      continue;
    }
    user = created.user;
    byAuthEmail.set(login, user);
    report.authCreated.push(`${emp.name} <${login}>`);
  } else {
    const updates = { password: DEMO_PW, email_confirm: true };
    if ((user.email || '').toLowerCase() !== login) {
      updates.email = login;
    }
    const { error: uErr } = await s.auth.admin.updateUserById(user.id, updates);
    if (uErr) {
      report.issues.push(`${emp.name}: auth update failed — ${uErr.message}`);
    } else {
      report.authUpdated.push(`${emp.name} <${login}>`);
    }
  }

  if (user?.id) {
    const { error: pErr } = await s.from('profiles').upsert(
      {
        id: user.id,
        email: login,
        name: emp.name,
        employee_id: emp.id,
      },
      { onConflict: 'id' },
    );
    if (pErr) report.issues.push(`${emp.name}: profile upsert — ${pErr.message}`);
  }

  if (!report.emailFixed.some((x) => x.startsWith(emp.name)) && !report.authCreated.some((x) => x.startsWith(emp.name))) {
    report.alreadyOk.push(`${emp.name} <${login}>`);
  }
}

// Final audit: any active EO still on peopleos (except Bunmi)?
const { data: leftover } = await s
  .from('employees')
  .select('name,email')
  .eq('subsidiary_id', EO)
  .eq('eo_appraisal_active', true)
  .ilike('email', '%@peopleos.co');

console.log('\n=== REPORT ===');
console.log('Email fixed:', report.emailFixed.length ? report.emailFixed : '(none)');
console.log('Auth created:', report.authCreated.length ? report.authCreated : '(none)');
console.log('Auth refreshed:', report.authUpdated.length);
console.log('Leftover @peopleos.co (active EO):', leftover?.length ? leftover : '(none — good)');
console.log('Issues:', report.issues.length ? report.issues : '(none)');
console.log(`\nShared pilot password: ${DEMO_PW}`);
console.log('Tell users: login at https://executive.vgg.tools/login with their corporate email.');
