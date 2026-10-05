/**
 * Apply EO org chart fields when supabase db push is unavailable.
 * Prefer: npx supabase db push
 * Run: node scripts/apply-eo-org-structure.mjs
 */
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
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const EO = '11111111-1111-1111-1111-111111111111';
const sb = createClient(url, key);

async function byEmail(email) {
  const { data } = await sb
    .from('employees')
    .select('id')
    .eq('subsidiary_id', EO)
    .ilike('email', email)
    .maybeSingle();
  return data?.id ?? null;
}

async function patch(email, fields) {
  const id = await byEmail(email);
  if (!id) {
    console.warn('Skip (not found):', email);
    return;
  }
  const { error } = await sb.from('employees').update(fields).eq('id', id);
  if (error) throw error;
  console.log('OK', email);
}

async function main() {
  let demolaId = await byEmail('demola.idowu@venturegardengroup.com');
  if (!demolaId) {
    const { data, error } = await sb
      .from('employees')
      .insert({
        subsidiary_id: EO,
        name: 'Demola Idowu',
        email: 'demola.idowu@venturegardengroup.com',
        role: 'Executive Leadership',
        department: 'Executive Office',
        department_code: 'l0',
        hierarchy_level: 0,
        appraisal_self_performance: true,
        appraisal_gives_comments: true,
        appraisal_receives_comments: false,
        eo_appraisal_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    demolaId = data.id;
    console.log('Inserted Demola');
  }

  const bunmi = await byEmail('bunmi.akinyemiju@peopleos.co');
  const kunmi = await byEmail('kunmi.demuren@peopleos.co');
  const uche = await byEmail('uche.ukonu@venturegardengroup.com');
  const gisele = await byEmail('gisele.karakezi@venturegardengroup.com');
  const deyi = await byEmail('deyi.dipeolu@venturegardengroup.com');
  const omotola = await byEmail('omotola.akinyemiju@venturegardengroup.com');
  const ayomide = await byEmail('adeosun.ayomide@venturegardengroup.com');
  const baluku = await byEmail('baluku.dounnah@venturegardengroup.com');

  await patch('bunmi.akinyemiju@peopleos.co', {
    hierarchy_level: 0,
    department_code: 'l0',
    manager_id: null,
    secondary_manager_id: null,
    appraisal_self_performance: true,
    appraisal_gives_comments: false,
    appraisal_receives_comments: false,
    eo_appraisal_active: true,
    is_epa_assessor: true,
    is_eo_lead_assessor: true,
  });
  await patch('kunmi.demuren@peopleos.co', {
    hierarchy_level: 0,
    department_code: 'l0',
    manager_id: bunmi,
    appraisal_self_performance: true,
    appraisal_gives_comments: true,
    appraisal_receives_comments: false,
    eo_appraisal_active: true,
    is_epa_assessor: true,
    is_eo_lead_assessor: true,
  });
  await patch('demola.idowu@venturegardengroup.com', {
    hierarchy_level: 0,
    department_code: 'l0',
    manager_id: bunmi,
    appraisal_self_performance: true,
    appraisal_gives_comments: true,
    appraisal_receives_comments: false,
    eo_appraisal_active: true,
    is_epa_assessor: true,
    is_eo_lead_assessor: true,
  });

  await patch('omotola.akinyemiju@venturegardengroup.com', {
    hierarchy_level: 1,
    department_code: 'l1_omotola',
    manager_id: bunmi,
    appraisal_self_performance: false,
    appraisal_gives_comments: false,
    appraisal_receives_comments: true,
    eo_appraisal_active: true,
  });
  await patch('uche.ukonu@venturegardengroup.com', {
    hierarchy_level: 1,
    department_code: 'l1_uche',
    manager_id: bunmi,
    appraisal_self_performance: true,
    appraisal_gives_comments: true,
    appraisal_receives_comments: true,
    eo_appraisal_active: true,
  });
  await patch('gisele.karakezi@venturegardengroup.com', {
    hierarchy_level: 1,
    department_code: 'l1_gisele',
    manager_id: bunmi,
    appraisal_self_performance: true,
    appraisal_gives_comments: true,
    appraisal_receives_comments: true,
    eo_appraisal_active: true,
  });
  await patch('deyi.dipeolu@venturegardengroup.com', {
    hierarchy_level: 1,
    department_code: 'l1_deyi',
    manager_id: bunmi,
    appraisal_self_performance: true,
    appraisal_gives_comments: true,
    appraisal_receives_comments: true,
    eo_appraisal_active: true,
  });

  await patch('eniola.olawale@peopleos.co', {
    hierarchy_level: 2,
    department_code: 'top_office',
    manager_id: kunmi,
    appraisal_receives_comments: true,
    eo_appraisal_active: true,
  });

  for (const email of [
    'adeyinka.oshin@venturegardengroup.com',
    'favour.oyekanmi@venturegardengroup.com',
    'adeosun.ayomide@venturegardengroup.com',
  ]) {
    await patch(email, {
      hierarchy_level: 2,
      department_code: 'general_ops',
      manager_id: omotola,
      secondary_manager_id: uche,
      appraisal_receives_comments: true,
      eo_appraisal_active: true,
    });
  }

  await patch('baluku.dounnah@venturegardengroup.com', {
    hierarchy_level: 1,
    department_code: 'central_ops',
    manager_id: uche,
    secondary_manager_id: null,
    appraisal_self_performance: false,
    appraisal_gives_comments: false,
    appraisal_receives_comments: true,
    eo_appraisal_active: true,
  });

  for (const email of [
    'regina.ottoh-ebhonu@venturegardengroup.com',
    'melissa.omede@venturegardengroup.com',
    'chukwuka.monyei@venturegardengroup.com',
  ]) {
    await patch(email, {
      hierarchy_level: 2,
      department_code: 'central_ops',
      manager_id: baluku,
      secondary_manager_id: null,
      appraisal_receives_comments: true,
      eo_appraisal_active: true,
    });
  }

  for (const email of [
    'oluwatobiloba.ijamakinwa@venturegardengroup.com',
    'brenda.nafula@vgplatform.com',
    'gideon.abiona@venturegardengroup.com',
  ]) {
    await patch(email, {
      hierarchy_level: 2,
      department_code: 'brand_comms',
      manager_id: gisele,
      appraisal_receives_comments: true,
      eo_appraisal_active: true,
    });
  }

  for (const email of ['dorathy.akor@venturegardengroup.com', 'tobi.bankole@venturegardengroup.com']) {
    await patch(email, {
      hierarchy_level: 2,
      department_code: 'technical',
      manager_id: ayomide,
      appraisal_receives_comments: true,
      eo_appraisal_active: true,
    });
  }

  const oreo = await byEmail('oreoluwa.ifia@peopleos.co');
  if (oreo) {
    await sb.from('employees').update({ eo_appraisal_active: false }).eq('id', oreo);
    console.log('Deactivated Oreoluwa from EO pilot');
  }

  console.log('\nDone. Run: npx supabase db push (for RPCs) and npm run seed:demo-auth');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
