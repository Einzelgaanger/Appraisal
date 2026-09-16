import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const xlsxPath = join(root, 'docs', 'Vigipay_Onboarding_Information_Template (1) (1).xlsx');
const outPath = join(root, 'supabase', 'migrations', '20260916180000_vigipay_org_lock_and_ghc_parity.sql');

const wb = XLSX.read(readFileSync(xlsxPath), { type: 'buffer', raw: false });
const rosterRows = XLSX.utils.sheet_to_json(wb.Sheets['Staff Roster'], { header: 1, defval: '', raw: false }).slice(3);
const mapRows = XLSX.utils.sheet_to_json(wb.Sheets['Review Mapping'], { header: 1, defval: '', raw: false });

const sql = (s) => String(s ?? '').replace(/'/g, "''");
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const normKey = (s) => norm(s).toLowerCase();
const fixEmail = (s) => norm(s).toLowerCase().replace(',', '.');

const ALIASES = new Map([
  ['lamidi taofeek', 'taofeek lamidi'],
]);

function canonicalName(name) {
  const k = normKey(name);
  return ALIASES.get(k) || norm(name);
}

const staff = [];
for (const r of rosterRows) {
  const name = norm(r[0]);
  if (!name) continue;
  staff.push({
    name,
    title: norm(r[1]),
    email: fixEmail(r[2]),
    team: norm(r[3]),
    level: norm(r[4]),
    flags: norm(r[5]),
    admin: /^y/i.test(String(r[6] || '')),
  });
}

const mappings = [];
for (const r of mapRows.slice(6)) {
  const subject = canonicalName(r[0]);
  const reviewer = canonicalName(r[1]);
  if (!subject || /example/i.test(subject)) continue;
  mappings.push({
    subject,
    reviewer,
    rel: norm(r[2]) || 'Work Manager',
  });
}

const byKey = new Map(staff.map((s) => [normKey(s.name), s]));
for (const m of mappings) {
  if (!byKey.has(normKey(m.subject))) {
    const extra = {
      name: m.subject,
      title: 'Pending title',
      email: '',
      team: 'Technology',
      level: 'L3',
      flags: 'Can self review and be reviewed',
      admin: false,
      missingEmail: true,
    };
    staff.push(extra);
    byKey.set(normKey(extra.name), extra);
  }
}

const reviewerSet = new Set(
  mappings.filter((m) => normKey(m.reviewer) !== 'partners').map((m) => normKey(m.reviewer)),
);

function parseBand(level) {
  const raw = String(level || '').trim();
  if (/intern/i.test(raw)) return { label: 'Intern', rank: 99 };
  const n = Number.parseFloat(raw.replace(/^[lL]/, ''));
  if (Number.isFinite(n)) return { label: raw.toUpperCase().replace(/^L/, 'L'), rank: n };
  return { label: raw || 'L3', rank: 3 };
}

function ghcHierarchy(person) {
  const { rank } = parseBand(person.level);
  const reviewsOthers = reviewerSet.has(normKey(person.name));
  if (rank >= 5) return 1;
  if (reviewsOthers) return 2;
  return 3;
}

const extraUuids = {
  'israel ulelu': '33333333-3333-4333-8333-333333333001',
  'kelvin esekhile': '33333333-3333-4333-8333-333333333002',
};

const personValues = staff
  .map((p) => {
    const uuid = extraUuids[normKey(p.name)];
    const idSql = uuid ? `'${uuid}'::uuid` : 'NULL';
    const emailSql = p.email ? `'${sql(p.email)}'` : 'NULL';
    return `    (${idSql}, '${sql(p.name)}', '${sql(p.title)}', ${emailSql}, '${sql(p.team)}', '${sql(parseBand(p.level).label)}', ${ghcHierarchy(p)}, ${p.admin ? 'true' : 'false'})`;
  })
  .join(',\n');

const managerValues = mappings
  .filter((m) => normKey(m.reviewer) !== 'partners')
  .map((m) => `    ('${sql(m.subject)}', '${sql(m.reviewer)}')`)
  .join(',\n');

const departments = [...new Set(staff.map((s) => s.team).filter(Boolean))].sort();
const roles = [...new Set(staff.map((s) => s.title).filter(Boolean))].sort();

const header = `-- VigiPay org seed + lock-to-tenant + GHC-style instruments scoped by appraisal pool.
-- Source: docs/Vigipay_Onboarding_Information_Template (1) (1).xlsx
-- Product parity with GHC until VigiPay sends form/scoring specs.
-- Isolation: vigipay_appraisal_active people never mix into GHC 360/eval pools.

`;

const functions = `
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS locked_tenant_slug text,
  ADD COLUMN IF NOT EXISTS vigipay_appraisal_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seniority_label text;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_appraisal_mode_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_appraisal_mode_check
  CHECK (appraisal_mode IN ('boom', 'legacy', 'ghc', 'vigipay'));

COMMENT ON COLUMN public.employees.locked_tenant_slug IS
  'If set, this person always uses that tenant UI (not email-domain routing).';
COMMENT ON COLUMN public.employees.vigipay_appraisal_active IS
  'VigiPay GHC-style appraisal pool. Must not overlap ghc_appraisal_active.';
COMMENT ON COLUMN public.employees.company_admin IS
  'Company-scoped People Ops / GM admin (not global user_roles.admin).';

UPDATE public.subsidiaries
SET hierarchy_lower_is_senior = true, name = 'VigiPay'
WHERE id = '33333333-3333-3333-3333-333333333333';

CREATE OR REPLACE FUNCTION public.vigipay_subsidiary_id()
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT '33333333-3333-3333-3333-333333333333'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.ghc_member_pool(_employee_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN e.id IS NULL THEN NULL
    WHEN coalesce(e.vigipay_appraisal_active, false) THEN 'vigipay'
    WHEN coalesce(e.ghc_appraisal_active, false) THEN 'ghc'
    ELSE NULL
  END
  FROM (SELECT _employee_id AS id) x
  LEFT JOIN public.employees e ON e.id = x.id;
$$;

CREATE OR REPLACE FUNCTION public.ghc_same_pool(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.ghc_member_pool(_a) IS NOT NULL
     AND public.ghc_member_pool(_a) = public.ghc_member_pool(_b);
$$;

CREATE OR REPLACE FUNCTION public.ghc_pool_subsidiary(_pool text)
RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _pool = 'vigipay' THEN '33333333-3333-3333-3333-333333333333'::uuid
    ELSE '22222222-2222-2222-2222-222222222222'::uuid
  END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_is_active_member(_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.ghc_member_pool(_employee_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.ghc_manages(_manager_id uuid, _report_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _report_id
      AND public.ghc_same_pool(_manager_id, _report_id)
      AND (
        COALESCE(e.ghc_manager_id, e.manager_id) = _manager_id
        OR COALESCE(e.ghc_secondary_manager_id, e.secondary_manager_id) = _manager_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.ghc_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.ghc_member_pool(public.ghc_me()) = 'vigipay' THEN EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = public.ghc_me() AND coalesce(e.company_admin, false)
    )
    ELSE public.has_role(auth.uid(), 'admin'::public.app_role)
  END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_admin_sees(_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.ghc_member_pool(public.ghc_me()) = 'vigipay' THEN
      public.ghc_is_admin() AND public.ghc_member_pool(_employee_id) = 'vigipay'
    ELSE
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND coalesce(public.ghc_member_pool(_employee_id), 'ghc') = 'ghc'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_hub_tenant(_employee_id uuid)
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.ghc_member_pool(_employee_id) = 'vigipay' THEN 'vigipay' ELSE 'ghc' END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_me()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  auth_email text;
  found uuid;
BEGIN
  me := public.current_employee_id();

  IF me IS NOT NULL AND public.ghc_is_active_member(me) THEN
    RETURN me;
  END IF;

  SELECT lower(coalesce(p.email, u.email))
  INTO auth_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();

  IF auth_email IS NOT NULL THEN
    SELECT e.id INTO found
    FROM public.employees e
    WHERE e.email IS NOT NULL
      AND lower(e.email) = auth_email
      AND (
        coalesce(e.locked_tenant_slug, '') = 'vigipay'
        OR coalesce(e.vigipay_appraisal_active, false)
        OR coalesce(e.ghc_appraisal_active, false)
      )
    ORDER BY
      CASE WHEN coalesce(e.locked_tenant_slug, '') = 'vigipay' THEN 0 ELSE 1 END,
      CASE WHEN coalesce(e.vigipay_appraisal_active, false) THEN 0 ELSE 1 END,
      CASE WHEN e.id = me THEN 0 ELSE 1 END
    LIMIT 1;
    IF found IS NOT NULL THEN RETURN found; END IF;

    -- GHC dual-email local-part match only. Never attach a VigiPay lock via local-part.
    SELECT e.id INTO found
    FROM public.employees e
    WHERE coalesce(e.ghc_appraisal_active, false)
      AND NOT coalesce(e.vigipay_appraisal_active, false)
      AND e.email IS NOT NULL
      AND split_part(lower(e.email), '@', 1) = split_part(auth_email, '@', 1)
    ORDER BY CASE WHEN e.id = me THEN 0 ELSE 1 END,
             CASE WHEN e.subsidiary_id = public.ghc_subsidiary_id() THEN 0 ELSE 1 END
    LIMIT 1;
    IF found IS NOT NULL THEN RETURN found; END IF;
  END IF;

  RETURN me;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_get_my_tasks(_period_month text, _period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  pool text;
  tasks jsonb := '[]'::jsonb;
BEGIN
  IF me IS NULL OR NOT public.ghc_is_active_member(me) THEN
    RETURN '[]'::jsonb;
  END IF;
  pool := public.ghc_member_pool(me);

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name), '[]'::jsonb)
  INTO tasks
  FROM (
    SELECT DISTINCT ON (e.id)
      'monthly_manager'::text AS kind,
      'Monthly manager review'::text AS title,
      e.id AS subject_id,
      e.name AS subject_name,
      e.role AS subject_role,
      _period_month AS period,
      COALESCE(r.status, 'todo') AS status,
      r.id AS record_id
    FROM public.employees e
    LEFT JOIN public.ghc_monthly_reviews r
      ON r.report_id = e.id AND r.manager_id = me AND r.period = _period_month
    WHERE public.ghc_member_pool(e.id) = pool
      AND e.id <> me
      AND (coalesce(e.ghc_manager_id, e.manager_id) = me
           OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
    ORDER BY e.id, e.name
  ) t;

  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name)
    FROM (
      SELECT DISTINCT ON (coalesce(nullif(split_part(lower(coalesce(e.email,'')), '@', 1), ''), e.id::text))
        'peer_360'::text AS kind,
        'Quarterly 360 feedback'::text AS title,
        e.id AS subject_id,
        e.name AS subject_name,
        e.role AS subject_role,
        _period_quarter AS period,
        COALESCE(r.status, 'todo') AS status,
        r.id AS record_id
      FROM public.employees e
      LEFT JOIN public.ghc_360_responses r
        ON r.reviewee_id = e.id AND r.reviewer_id = me AND r.period = _period_quarter
      WHERE public.ghc_member_pool(e.id) = pool
        AND e.id <> me
        AND split_part(lower(coalesce(e.email,'')), '@', 1)
            IS DISTINCT FROM split_part(lower(coalesce((SELECT email FROM employees WHERE id = me), '')), '@', 1)
      ORDER BY coalesce(nullif(split_part(lower(coalesce(e.email,'')), '@', 1), ''), e.id::text),
               e.name
    ) t
  ), '[]'::jsonb);

  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name)
    FROM (
      SELECT DISTINCT ON (e.id)
        'quarterly_evaluation'::text AS kind,
        'Quarterly performance evaluation'::text AS title,
        e.id AS subject_id,
        e.name AS subject_name,
        e.role AS subject_role,
        _period_quarter AS period,
        COALESCE(q.status, 'todo') AS status,
        q.id AS record_id
      FROM public.employees e
      LEFT JOIN public.ghc_quarterly_evaluations q
        ON q.employee_id = e.id AND q.manager_id = me AND q.period = _period_quarter
      WHERE public.ghc_member_pool(e.id) = pool
        AND e.id <> me
        AND (coalesce(e.ghc_manager_id, e.manager_id) = me
             OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
      ORDER BY e.id, e.name
    ) t
  ), '[]'::jsonb);

  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb)
    FROM (
      SELECT
        'acknowledge_evaluation'::text AS kind,
        'Acknowledge quarterly evaluation'::text AS title,
        q.employee_id AS subject_id,
        emp.name AS subject_name,
        emp.role AS subject_role,
        q.period AS period,
        q.status AS status,
        q.id AS record_id
      FROM public.ghc_quarterly_evaluations q
      JOIN public.employees emp ON emp.id = q.employee_id
      WHERE q.employee_id = me
        AND q.period = _period_quarter
        AND q.status IN ('submitted', 'acknowledged')
    ) t
  ), '[]'::jsonb);

  RETURN tasks;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_get_directory_status(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  pool text := coalesce(public.ghc_member_pool(me), 'ghc');
BEGIN
  IF NOT (public.ghc_is_admin() OR public.ghc_is_active_member(me)) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.hierarchy_level, t.name)
    FROM (
      SELECT
        e.id,
        e.name,
        e.role,
        e.department,
        COALESCE(e.ghc_hierarchy_level, e.hierarchy_level) AS hierarchy_level,
        coalesce(e.ghc_manager_id, e.manager_id) AS manager_id,
        coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) AS secondary_manager_id,
        e.email,
        EXISTS (
          SELECT 1 FROM public.ghc_monthly_reviews m
          WHERE m.report_id = e.id AND m.period = _period_month AND m.status = 'submitted'
        ) AS monthly_done,
        (
          SELECT COUNT(*) FROM public.ghc_360_responses r
          WHERE r.reviewee_id = e.id AND r.period = _period_quarter AND r.status = 'submitted'
        ) AS peer_360_count,
        EXISTS (
          SELECT 1 FROM public.ghc_quarterly_evaluations q
          WHERE q.employee_id = e.id AND q.period = _period_quarter AND q.status IN ('submitted', 'acknowledged')
        ) AS eval_done
      FROM public.employees e
      WHERE public.ghc_member_pool(e.id) = pool
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_release_period(_kind text, _period text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid uuid;
  rec record;
  me uuid := public.ghc_me();
  pool text := coalesce(public.ghc_member_pool(me), 'ghc');
  tenant text := public.ghc_hub_tenant(me);
  sub uuid := public.ghc_pool_subsidiary(pool);
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  INSERT INTO public.ghc_cycle_settings (subsidiary_id, kind, period, released_at, released_by)
  VALUES (sub, _kind, _period, now(), me)
  ON CONFLICT (subsidiary_id, kind, period) DO UPDATE
  SET released_at = now(), released_by = me
  RETURNING id INTO sid;

  IF _kind = 'peer_360' THEN
    FOR rec IN
      SELECT e.id
      FROM public.employees e
      WHERE public.ghc_member_pool(e.id) = pool
    LOOP
      PERFORM public.ghc_create_notification(
        rec.id,
        'peer_360_released',
        '360 results released',
        'Your anonymous peer 360 aggregate is now available.',
        '/hub?tenant=' || tenant || '&tab=dashboard',
        _period
      );
    END LOOP;
  ELSIF _kind = 'quarterly_evaluation' THEN
    UPDATE public.ghc_quarterly_evaluations q
    SET released_at = COALESCE(released_at, now()), updated_at = now()
    WHERE q.period = _period
      AND q.status IN ('submitted', 'acknowledged')
      AND public.ghc_member_pool(q.employee_id) = pool;
  END IF;

  RETURN sid;
END;
$$;

DROP POLICY IF EXISTS ghc_cycle_select ON public.ghc_cycle_settings;
CREATE POLICY ghc_cycle_select ON public.ghc_cycle_settings FOR SELECT TO authenticated
USING (
  subsidiary_id = public.ghc_pool_subsidiary(coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc'))
  AND (public.ghc_is_admin() OR public.ghc_is_active_member(public.ghc_me()))
);

DROP POLICY IF EXISTS ghc_cycle_admin ON public.ghc_cycle_settings;
CREATE POLICY ghc_cycle_admin ON public.ghc_cycle_settings FOR ALL TO authenticated
USING (
  public.ghc_is_admin()
  AND subsidiary_id = public.ghc_pool_subsidiary(coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc'))
)
WITH CHECK (
  public.ghc_is_admin()
  AND subsidiary_id = public.ghc_pool_subsidiary(coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc'))
);

DROP POLICY IF EXISTS ghc_monthly_select ON public.ghc_monthly_reviews;
CREATE POLICY ghc_monthly_select ON public.ghc_monthly_reviews FOR SELECT TO authenticated
USING (
  public.ghc_admin_sees(report_id)
  OR manager_id = public.ghc_me()
  OR (report_id = public.ghc_me() AND status = 'submitted')
);

DROP POLICY IF EXISTS ghc_monthly_write ON public.ghc_monthly_reviews;
CREATE POLICY ghc_monthly_write ON public.ghc_monthly_reviews FOR ALL TO authenticated
USING (public.ghc_admin_sees(report_id) OR manager_id = public.ghc_me())
WITH CHECK (public.ghc_admin_sees(report_id) OR manager_id = public.ghc_me());

DROP POLICY IF EXISTS ghc_360_select ON public.ghc_360_responses;
CREATE POLICY ghc_360_select ON public.ghc_360_responses FOR SELECT TO authenticated
USING (
  public.ghc_admin_sees(reviewee_id)
  OR reviewer_id = public.ghc_me()
);

DROP POLICY IF EXISTS ghc_360_write ON public.ghc_360_responses;
CREATE POLICY ghc_360_write ON public.ghc_360_responses FOR ALL TO authenticated
USING (public.ghc_admin_sees(reviewee_id) OR reviewer_id = public.ghc_me())
WITH CHECK (public.ghc_admin_sees(reviewee_id) OR reviewer_id = public.ghc_me());

DROP POLICY IF EXISTS ghc_eval_select ON public.ghc_quarterly_evaluations;
CREATE POLICY ghc_eval_select ON public.ghc_quarterly_evaluations FOR SELECT TO authenticated
USING (
  public.ghc_admin_sees(employee_id)
  OR manager_id = public.ghc_me()
  OR (employee_id = public.ghc_me() AND (status IN ('submitted', 'acknowledged') OR released_at IS NOT NULL))
);

DROP POLICY IF EXISTS ghc_eval_write ON public.ghc_quarterly_evaluations;
CREATE POLICY ghc_eval_write ON public.ghc_quarterly_evaluations FOR ALL TO authenticated
USING (public.ghc_admin_sees(employee_id) OR manager_id = public.ghc_me() OR employee_id = public.ghc_me())
WITH CHECK (public.ghc_admin_sees(employee_id) OR manager_id = public.ghc_me() OR employee_id = public.ghc_me());
`;

const seed = `
CREATE OR REPLACE FUNCTION public.vigipay_seed_person(
  _id uuid,
  _name text,
  _role text,
  _email text,
  _department text,
  _seniority text,
  _ghc_level integer,
  _company_admin boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing uuid;
  sid uuid := public.vigipay_subsidiary_id();
BEGIN
  IF _email IS NOT NULL THEN
    SELECT id INTO existing FROM public.employees WHERE lower(email) = lower(_email) LIMIT 1;
  ELSIF _id IS NOT NULL THEN
    existing := _id;
  END IF;

  IF existing IS NOT NULL THEN
    UPDATE public.employees SET
      name = _name,
      role = _role,
      department = _department,
      seniority_label = _seniority,
      hierarchy_level = _ghc_level,
      ghc_hierarchy_level = _ghc_level,
      subsidiary_id = sid,
      eo_appraisal_active = false,
      ghc_appraisal_active = false,
      vigipay_appraisal_active = true,
      locked_tenant_slug = 'vigipay',
      company_admin = _company_admin,
      email = COALESCE(_email, email)
    WHERE id = existing;
    RETURN existing;
  END IF;

  INSERT INTO public.employees (
    id, subsidiary_id, name, role, email, department,
    hierarchy_level, ghc_hierarchy_level, seniority_label,
    eo_appraisal_active, ghc_appraisal_active, vigipay_appraisal_active,
    locked_tenant_slug, company_admin
  ) VALUES (
    COALESCE(_id, gen_random_uuid()), sid, _name, _role, _email, _department,
    _ghc_level, _ghc_level, _seniority,
    false, false, true,
    'vigipay', _company_admin
  )
  RETURNING id INTO existing;
  RETURN existing;
END;
$$;

DO $$
DECLARE
  rec record;
  mgr uuid;
  subj uuid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
${personValues}
    ) AS t(id, name, title, email, team, seniority, lvl, is_admin)
  LOOP
    PERFORM public.vigipay_seed_person(rec.id, rec.name, rec.title, rec.email, rec.team, rec.seniority, rec.lvl, rec.is_admin);
  END LOOP;

  -- Clear then re-apply work-manager graph from the returned mapping sheet.
  UPDATE public.employees e
  SET manager_id = NULL, ghc_manager_id = NULL, secondary_manager_id = NULL, ghc_secondary_manager_id = NULL
  WHERE coalesce(e.vigipay_appraisal_active, false);

  FOR rec IN
    SELECT * FROM (VALUES
${managerValues}
    ) AS t(subject_name, reviewer_name)
  LOOP
    SELECT id INTO subj
    FROM public.employees
    WHERE coalesce(vigipay_appraisal_active, false)
      AND lower(regexp_replace(name, '\\s+', ' ', 'g')) = lower(regexp_replace(rec.subject_name, '\\s+', ' ', 'g'))
    LIMIT 1;
    SELECT id INTO mgr
    FROM public.employees
    WHERE coalesce(vigipay_appraisal_active, false)
      AND lower(regexp_replace(name, '\\s+', ' ', 'g')) = lower(regexp_replace(rec.reviewer_name, '\\s+', ' ', 'g'))
    LIMIT 1;
    IF subj IS NOT NULL AND mgr IS NOT NULL AND subj <> mgr THEN
      UPDATE public.employees
      SET manager_id = mgr, ghc_manager_id = mgr
      WHERE id = subj;
    ELSIF subj IS NULL THEN
      RAISE NOTICE 'VigiPay mapping subject missing: %', rec.subject_name;
    ELSIF mgr IS NULL THEN
      RAISE NOTICE 'VigiPay mapping reviewer missing: %', rec.reviewer_name;
    END IF;
  END LOOP;
END $$;

UPDATE public.profiles p
SET subsidiary_id = e.subsidiary_id,
    employee_id = COALESCE(p.employee_id, e.id)
FROM public.employees e
WHERE e.email IS NOT NULL
  AND lower(p.email) = lower(e.email)
  AND coalesce(e.locked_tenant_slug, '') = 'vigipay';
`;

const footer = `
GRANT EXECUTE ON FUNCTION public.vigipay_subsidiary_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_member_pool(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_same_pool(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_admin_sees(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_hub_tenant(uuid) TO authenticated;

UPDATE public.tenants
SET
  appraisal_mode = 'vigipay',
  capabilities = '{
    "showDemoRoute":false,
    "showRankings":false,
    "showGrowthHub":true,
    "showLegacyDashboard":false,
    "showLegacySurvey":false,
    "showAppraisalAdmin":true,
    "showEaQuarterlyResults":false,
    "showDirectoryInsights":true,
    "showComments":false,
    "showMonthlyManagerReviews":true,
    "showGhcPeer360":true,
    "showQuarterlyEvaluation":true,
    "showAiAssist":true,
    "showEvaluationDiscussions":true
  }'::jsonb,
  updated_at = now()
WHERE slug = 'vigipay';

UPDATE public.tenant_modules
SET settings = '{"defaultRoute":"/hub?tab=survey&tenant=vigipay"}'::jsonb
WHERE tenant_id = '33333333-3333-3333-3333-333333333330' AND module_key = 'appraisal';
`;

writeFileSync(outPath, header + functions + seed + footer);
console.log('Wrote', outPath);
console.log('people', staff.length, 'mappings', mappings.length);
console.log('departments', departments.join(' | '));
console.log('roles', roles.length);
console.log('admins', staff.filter((s) => s.admin).map((s) => s.name).join(', '));
console.log('missing email', staff.filter((s) => !s.email).map((s) => s.name).join(', '));
