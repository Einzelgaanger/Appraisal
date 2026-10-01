/**
 * Copy production people, companies, roles, and appraisal catalogs into local Docker.
 * Never writes dumps into git. Refuses to run unless the target is 127.0.0.1 / localhost.
 *
 *   npm run db:local:sync
 */
import {
  assertLocalSupabaseUrl,
  connectLocalPostgres,
  connectProdPostgres,
  copyTable,
  localEnv,
  localSupabaseAdmin,
  passwordForSubsidiary,
  prodEnv,
  tableColumns,
  tableExists,
} from './local-supabase.mjs';

const CATALOG_TABLES = [
  'subsidiaries',
  'tenants',
  'tenant_domains',
  'tenant_modules',
  'tenant_appraisal_configs',
  'tenant_role_definitions',
  'tenant_hierarchy_levels',
  'tenant_form_sets',
  'tenant_routing_rules',
  'employees',
  'assessment_forms',
  'assessment_questions',
  'survey_categories',
  'survey_questions',
  'ghc_cycle_settings',
  'executive_period_okrs',
  'eo_ea_quarterly_pairs',
  'assessment_period_releases',
  'source_domain_policy',
  'resource_catalog',
];

async function listAuthUsers(supabase) {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }
  return users;
}

async function ensureAuthUser(supabase, cache, email, password) {
  const emailLower = email.trim().toLowerCase();
  const existing = cache.find((u) => (u.email || '').toLowerCase() === emailLower);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return { id: existing.id, created: false };
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: emailLower,
    password,
    email_confirm: true,
  });
  if (!error && data?.user?.id) {
    cache.push({ id: data.user.id, email: emailLower });
    return { id: data.user.id, created: true };
  }
  const msg = String(error?.message || '').toLowerCase();
  if (!msg.includes('already') && !msg.includes('registered') && error?.status !== 422) {
    throw error;
  }
  cache.length = 0;
  cache.push(...(await listAuthUsers(supabase)));
  const again = cache.find((u) => (u.email || '').toLowerCase() === emailLower);
  if (!again) throw error || new Error(`Could not create ${emailLower}`);
  const { error: updErr } = await supabase.auth.admin.updateUserById(again.id, {
    password,
    email_confirm: true,
  });
  if (updErr) throw updErr;
  return { id: again.id, created: false };
}

async function main() {
  const docker = localEnv();
  const cloud = prodEnv();
  const localUrl = docker.VITE_SUPABASE_URL || docker.SUPABASE_URL;
  const prodUrl = cloud.VITE_SUPABASE_URL || cloud.SUPABASE_URL;
  assertLocalSupabaseUrl(localUrl, 'local VITE_SUPABASE_URL');
  if (!prodUrl || /127\.0\.0\.1|localhost/i.test(prodUrl)) {
    console.error('`.env` must point at production so the roster can be copied. Found:', prodUrl || '(empty)');
    process.exit(1);
  }

  console.log('Copying production roster → local Docker');
  console.log(`  from ${prodUrl}`);
  console.log(`  to   ${localUrl}`);

  const prod = await connectProdPostgres();
  const local = await connectLocalPostgres();
  const admin = localSupabaseAdmin();

  try {
    await local.query(`SET session_replication_role = replica`);
    console.log('\nCatalog + people');
    await local.query(`TRUNCATE TABLE public.employees CASCADE`);
    await local.query(`TRUNCATE TABLE public.tenant_domains CASCADE`);
    await local.query(`TRUNCATE TABLE public.tenant_modules CASCADE`);
    if (await tableExists(local, 'assessment_forms')) {
      await local.query(`TRUNCATE TABLE public.assessment_forms CASCADE`);
    }
    for (const table of CATALOG_TABLES) {
      try {
        await copyTable(prod, local, table);
      } catch (e) {
        console.warn(`  ${table}: ${e.message || e}`);
      }
    }

    if (await tableExists(prod, 'employees') && (await tableExists(local, 'employees'))) {
      const { rows: prodIds } = await prod.query(`SELECT id FROM public.employees`);
      if (prodIds.length) {
        const { rowCount } = await local.query(
          `DELETE FROM public.employees WHERE id <> ALL($1::uuid[])`,
          [prodIds.map((r) => r.id)],
        );
        if (rowCount) console.log(`  removed ${rowCount} local-only employee rows`);
      }
    }

    const { rows: employees } = await local.query(
      `SELECT * FROM public.employees
        WHERE email IS NOT NULL AND btrim(email) <> ''`,
    );

    console.log(`\nLocal auth logins (${employees.length} roster emails)`);
    let created = 0;
    let updated = 0;
    const cache = await listAuthUsers(admin);
    const profileByEmail = new Map();

    for (const emp of employees) {
      const email = String(emp.email).trim().toLowerCase();
      const password = passwordForSubsidiary(emp.subsidiary_id);
      const { id, created: wasNew } = await ensureAuthUser(admin, cache, email, password);
      if (wasNew) created += 1;
      else updated += 1;

      const profileCols = new Set(await tableColumns(local, 'profiles'));
      const profileRow = {
        id,
        employee_id: emp.id,
        name: emp.name || email.split('@')[0],
        email,
        role: emp.role,
        department: emp.department,
        subsidiary_id: emp.subsidiary_id,
        hierarchy_level: emp.hierarchy_level,
        profile_completed: true,
        profile_completed_at: new Date().toISOString(),
        active_employee_id: emp.id,
      };
      const payload = Object.fromEntries(
        Object.entries(profileRow).filter(([key]) => profileCols.has(key)),
      );
      const { error } = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      profileByEmail.set(email, id);
    }

    if (await tableExists(prod, 'employee_access')) {
      const { rows: access } = await prod.query(`
        SELECT lower(p.email) AS email, ea.employee_id
          FROM public.employee_access ea
          JOIN public.profiles p ON p.id = ea.profile_id
         WHERE p.email IS NOT NULL
      `);
      let grants = 0;
      for (const row of access) {
        const profileId = profileByEmail.get(row.email);
        if (!profileId) continue;
        await local.query(
          `INSERT INTO public.employee_access (profile_id, employee_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [profileId, row.employee_id],
        );
        grants += 1;
      }
      console.log(`  employee_access grants: ${grants}`);
    }

    for (const [email, profileId] of profileByEmail.entries()) {
      const emp = employees.find((e) => String(e.email).trim().toLowerCase() === email);
      if (!emp) continue;
      await local.query(
        `INSERT INTO public.employee_access (profile_id, employee_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [profileId, emp.id],
      );
    }

    if (await tableExists(prod, 'user_roles')) {
      const { rows: roles } = await prod.query(`
        SELECT lower(u.email) AS email, r.role
          FROM public.user_roles r
          JOIN auth.users u ON u.id = r.user_id
         WHERE u.email IS NOT NULL
      `);
      let roleCount = 0;
      for (const row of roles) {
        const userId = profileByEmail.get(row.email);
        if (!userId) continue;
        await local.query(
          `INSERT INTO public.user_roles (user_id, role)
           VALUES ($1, $2)
           ON CONFLICT (user_id, role) DO NOTHING`,
          [userId, row.role],
        );
        roleCount += 1;
      }
      console.log(`  user_roles copied: ${roleCount}`);
    }

    await local.query(`SET session_replication_role = origin`);

    console.log('');
    console.log('Done.');
    console.log(`  Auth created: ${created}`);
    console.log(`  Auth updated: ${updated}`);
    console.log('  Local passwords by company:');
    console.log('    Executive Team  BoomEoDemo2026!');
    console.log('    GHC             GhcDemo2026!');
    console.log('    VigiPay         VigiPayDemo2026!');
    console.log('');
    console.log('This copy is only inside Docker. Pushing to main does not send it.');
  } finally {
    await prod.end().catch(() => {});
    await local.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
