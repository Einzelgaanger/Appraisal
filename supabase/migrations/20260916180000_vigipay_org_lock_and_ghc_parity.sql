-- VigiPay org seed + lock-to-tenant + GHC-style instruments scoped by appraisal pool.
-- Source: docs/Vigipay_Onboarding_Information_Template (1) (1).xlsx
-- Product parity with GHC until VigiPay sends form/scoring specs.
-- Isolation: vigipay_appraisal_active people never mix into GHC 360/eval pools.


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

INSERT INTO public.subsidiaries (id, name, hierarchy_lower_is_senior)
VALUES ('33333333-3333-3333-3333-333333333333', 'VigiPay', true)
ON CONFLICT (id) DO UPDATE
SET name = excluded.name, hierarchy_lower_is_senior = true;

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
  END IF;
  IF existing IS NULL AND _id IS NOT NULL THEN
    SELECT id INTO existing FROM public.employees WHERE id = _id;
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
    (NULL, 'Azeez Quadri', 'Product Manager, Sling', 'azeez.quadri@fidesicng.com', 'Product', 'L4', 2, false),
    (NULL, 'Godspower Ochiobi', 'Business Manager, Fidesic', 'godspower.ochiobi@fidesicng.com', 'Fidesic', 'L5', 1, false),
    (NULL, 'Moses Elemile', 'Quality Assurance Engineer', 'moses.elemile@venturegardengroup.com', 'Technology', 'L4', 2, false),
    (NULL, 'Ibijoke Oyewole', 'Head, Product & Strategy', 'ibijoke.oyewole@venturegardengroup.com', 'Product', 'L6', 1, false),
    (NULL, 'John Mgbako', 'Front-end Engineer', 'john.mgbako@venturegardengroup.com', 'Technology', 'L4', 3, false),
    (NULL, 'Vincent Nkemjika', 'Product Manager, Swerve', 'vincent.nkemjika@venturegardengroup.com', 'Product', 'L2.5', 3, false),
    (NULL, 'Margaret Oduwole', 'Business Analyst', 'margaret.oduwole@venturegardengroup.com', 'Strategy', 'L2.5', 2, false),
    (NULL, 'Henry Megwai', 'DCTO, Site Reliability, SecOps, IT Audit and Certification', 'henry.megwai@venturegardengroup.com', 'Technology', 'L5', 1, false),
    (NULL, 'Lawal Abdulateef', 'DCTO, Application Development & Delivery', 'lawal.abdulateef@venturegardengroup.com', 'Technology', 'L5', 1, false),
    (NULL, 'Ikechukwu Apeh', 'Technology Team Lead, Fidesic', 'ikechukwu.apeh@venturegardengroup.com', 'Technology', 'L3.5', 3, false),
    (NULL, 'Emmanuel Oriahi', 'Technology Team Lead, Sling', 'emmanuel.oriahi@venturegardengroup.com', 'Technology', 'L4', 3, false),
    (NULL, 'Esther Ita', 'Product Specialist', 'esther.ita@venturegardengroup.com', 'Product', 'L2.5', 3, false),
    (NULL, 'Dressman Preye', 'Product Manager, Fidesic', 'dressman.preye@venturegardengroup.com', 'Product', 'L2.5', 3, false),
    (NULL, 'Oluseyi Oluwabusola', 'General Manager', 'oluseyi.oluwabusola@venturegardengroup.com', 'General Manager', 'L6', 1, true),
    (NULL, 'Felix Emmanuel', 'Transaction Monitoring Officer', 'felix.emmanuel@fidesicng.com', 'Treasury Operations', 'L2.5', 3, false),
    (NULL, 'Olanrewaju Iluyemi', 'Sales Lead', 'olanrewaju.iluyemi@venturegardengroup.com', 'Fidesic', 'L3.5', 3, false),
    (NULL, 'Elizabeth Adebayo', 'Customer Service Associate', 'elizabeth.adebayo@venturegardengroup.com', 'Fidesic', 'L2.5', 3, false),
    (NULL, 'Saheed Amusat', 'Finance Manager', 'amusat.saheed@venturegardengroup.com', 'Finance', 'L4.5', 2, false),
    (NULL, 'Kennedy Osigwe', 'Strategy & Execution, Swerve', 'kennedy.osigwe@venturegardengroup.com', 'Strategy', 'L2.5', 2, false),
    (NULL, 'Olushayo Fagbenro', 'Team Lead, Frontend Engineering', 'olushayo.fagbenro@venturegardengroup.com', 'Technology', 'L3', 2, false),
    (NULL, 'Ajibade Adeola', 'Quality Assurance Engineer', 'ajibade.adeola@venturegardengroup.com', 'Technology', 'L3', 3, false),
    (NULL, 'Charles Uhiara', 'Team Lead, Android Development', 'charles.uhiara@venturegardengroup.com', 'Technology', 'L4', 3, false),
    (NULL, 'Abiodun Adigun', 'Deputy Team Lead, Operations', 'abiodun.adigun@venturegardengroup.com', 'Treasury Operations', 'L2.5', 3, false),
    (NULL, 'Ifeanyi Nwosu', 'Growth Manager', 'ifeanyi.nwosu@venturegardengroup.com', 'Growth', 'L4', 2, false),
    (NULL, 'Ufuoma Otutu', 'Assistant Manager, People Ops', 'ufuoma.otutu@venturegardengroup.com', 'People Operations', 'L4', 2, true),
    (NULL, 'Ifeanyi Nwankpa', 'Product Support Officer', 'ifeanyi.nwankpa@venturegardengroup.com', 'Fidesic', 'L2', 3, false),
    (NULL, 'James Taighobe', 'Product designer', 'james.taighobe@venturegardengroup.com', 'Product', 'L2', 3, false),
    (NULL, 'Azeezat Iyemifokhae', 'People Ops Analyst', 'azeezat.iyemifokhae@venturegardengroup.com', 'People Operations', 'L2', 3, true),
    (NULL, 'Oluwabusola Obafemi', 'Business Development & Strategy Execution, Sling', 'oluwabusola.obafemi@venturegardengroup.com', 'Growth', 'L2', 3, false),
    (NULL, 'Micheal Fapohunda', 'Product Specialist Swerve', 'micheal.fapohunda@venturegardengroup.com', 'Product', 'L2', 3, false),
    (NULL, 'Stephen Balogun', 'Senior Accountant', 'stephen.balogun@venturegardengroup.com', 'Finance', 'L3.5', 2, false),
    (NULL, 'Omobolanle Adebiyi', 'Treasury & FX Trading', 'omobolanle.adebiyi@venturegardengroup.com', 'Treasury Operations', 'L2.5', 3, false),
    (NULL, 'David Unuane', 'Product Manager, CrossBorda', 'david.unuane@venturegardengroup.com', 'Product', 'L5', 1, false),
    (NULL, 'Samuel Oseni', 'Support and Deployment Officer', 'samuel.oseni@venturegardengroup.com', 'Fidesic', 'L1', 3, false),
    (NULL, 'Abraham Giwa', 'Support and Deployment Officer', 'abraham.giwa@venturegardengroup.com', 'Fidesic', 'L1', 3, false),
    (NULL, 'Ibukunoluwa Ajayi', 'AML/Compliance Analyst', 'ibukunoluwa.ajayi@venturegardengroup.com', 'Compliance', 'L3', 3, false),
    (NULL, 'Korede Asojo', 'Product Marketing Officer', 'korede.asojo@venturegardengroup.com', 'Product', 'L3', 3, false),
    (NULL, 'Oluwapamilerinayo Eniolorunda', 'Brand Strategist', 'oluwapamilerinayo.eniolorunda@venturegardengroup.com', 'Product', 'L2', 3, false),
    (NULL, 'Olayiwola Osho', 'Android Engineer', 'olayiwola.osho@venturegardengroup.com', 'Technology', 'L3', 3, false),
    (NULL, 'Daniella Obia', 'Settlement and Reconciliation Officer', 'daniella.obia@venturegardengroup.com', 'Treasury Operations', 'L2.5', 3, false),
    (NULL, 'Ayomide Adeosun', 'Strategy & Execution, Fidesic', 'ayomide.adeosun@venturegardengroup.com', 'Strategy', 'L2.5', 2, false),
    (NULL, 'Sopuluchi Obiora', 'Settlement and Reconciliation Officer', 'sopuluchi.obiora@venturegardengroup.com', 'Treasury Operations', 'L2.5', 3, false),
    (NULL, 'Temitope Oniyide', 'Chief Technology Officer', 'temitope.oniyide@venturegardengroup.com', 'Technology', 'L6', 1, false),
    (NULL, 'Bunmi Adejugbe', 'Finance Intern', 'bunmi.adejugbe@venturegardengroup.com', 'Finance', 'Intern', 1, false),
    (NULL, 'Olamide Adigun', 'Senior Product Manager', 'olamide.adigun@venturegardengroup.com', 'Product', 'L5', 1, false),
    (NULL, 'Taofeek Lamidi', 'Engineering Manager, CrossBord & Sling', 'lamidi.taofeek@venturegardengroup.com', 'Technology', 'L5', 1, false),
    (NULL, 'Kehinde Akinboni', 'Settlement & Reconciliation Specialist', 'kehinde.akinboni@venturegardengroup.com', 'Treasury Operations', 'L4', 2, false),
    (NULL, 'Osy Ernesto', 'Devops Resource Management and Deployment', 'osy.ernesto@venturegardengroup.com', 'Technology', 'L4', 3, false),
    (NULL, 'Victoria Enema', 'Product Intern', 'victoria.enema@venturegardengroup.com', 'Product', 'Intern', 1, false),
    (NULL, 'Oluwatobiloba Dokunmu', 'Product Intern', 'oluwatobiloba.dokunmu@venturegardengroup.com', 'Product', 'Intern', 1, false),
    (NULL, 'Adedotun Adebayo', 'Product Intern', 'adedotun.adebayo@venturegardengroup.com', 'Product', 'Intern', 1, false),
    (NULL, 'Pelumi Oladele', 'Customer Service Officer', 'pelumi.oladele@venturegardengroup.com', 'Fidesic', 'L1', 3, false),
    (NULL, 'Saviour Nyah', 'Treasury & FX Trading', 'saviour.nyah@venturegardengroup.com', 'Treasury Operations', 'L3', 3, false),
    (NULL, 'Ayoola Kelani', 'Enterprise Architect', 'ayoola.kelani@venturegardengroup.com', 'Technology', 'L5', 1, false),
    (NULL, 'Segun Oyesanya', 'Product Designer', 'segun.oyesanya@venturegardengroup.com', 'Product', 'L3', 3, false),
    (NULL, 'Marcia Cole', 'Frontend Engineer', 'marcia.cole@venturegardengroup.com', 'Technology', 'L4', 3, false),
    (NULL, 'Jide Onakoya', 'Quality Assurance Engineer', 'babajide.onakoya@venturegardengroup.com', 'Technology', 'L4.5', 3, false),
    (NULL, 'Oluwadamilola Aluko', 'Finance Intern', 'oluwadamilola.aluko@venturegardengroup.com', 'Finance', 'Intern', 1, false),
    (NULL, 'Oluwatobiloba Adegbite', 'Business Development & Partnership', 'oluwatobiloba.adegbite@venturegardengroup.com', 'Growth', 'L4', 3, false),
    (NULL, 'Tajudeen Yusuf', 'Frontend Intern', 'tajudeen.yusuf@venturegardengroup.com', 'Technology', 'Intern', 1, false),
    (NULL, 'Oluwapelumi Adejimi', 'AML Transaction Monitoring Officer', 'oluwapelumi.adejimi@venturegardengroup.com', 'Compliance', 'L2', 3, false),
    ('33333333-3333-4333-8333-333333333001'::uuid, 'Israel Ulelu', 'Pending title', NULL, 'Technology', 'L3', 3, false),
    ('33333333-3333-4333-8333-333333333002'::uuid, 'Kelvin Esekhile', 'Pending title', NULL, 'Technology', 'L3', 3, false)
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
    ('Azeez Quadri', 'Olamide Adigun'),
    ('Godspower Ochiobi', 'Ibijoke Oyewole'),
    ('Moses Elemile', 'Lawal Abdulateef'),
    ('Ibijoke Oyewole', 'Oluseyi Oluwabusola'),
    ('John Mgbako', 'Temitope Oniyide'),
    ('Vincent Nkemjika', 'Olamide Adigun'),
    ('Margaret Oduwole', 'Ibijoke Oyewole'),
    ('Henry Megwai', 'Temitope Oniyide'),
    ('Lawal Abdulateef', 'Temitope Oniyide'),
    ('Ikechukwu Apeh', 'Lawal Abdulateef'),
    ('Emmanuel Oriahi', 'taofeek lamidi'),
    ('Esther Ita', 'Olamide Adigun'),
    ('Dressman Preye', 'Olamide Adigun'),
    ('Felix Emmanuel', 'Kehinde Akinboni'),
    ('Olanrewaju Iluyemi', 'Ifeanyi Nwosu'),
    ('Elizabeth Adebayo', 'Azeez Quadri'),
    ('Saheed Amusat', 'Oluseyi Oluwabusola'),
    ('Kennedy Osigwe', 'Ibijoke Oyewole'),
    ('Olushayo Fagbenro', 'Lawal Abdulateef'),
    ('Ajibade Adeola', 'Moses Elemile'),
    ('Charles Uhiara', 'Lawal Abdulateef'),
    ('Abiodun Adigun', 'Kehinde Akinboni'),
    ('Ifeanyi Nwosu', 'Oluseyi Oluwabusola'),
    ('Ufuoma Otutu', 'Oluseyi Oluwabusola'),
    ('Israel Ulelu', 'Lawal Abdulateef'),
    ('Ifeanyi Nwankpa', 'Olamide Adigun'),
    ('James Taighobe', 'Olamide Adigun'),
    ('Azeezat Iyemifokhae', 'Ufuoma Otutu'),
    ('Oluwabusola Obafemi', 'Azeez Quadri'),
    ('Micheal Fapohunda', 'Olamide Adigun'),
    ('Stephen Balogun', 'Oluseyi Oluwabusola'),
    ('Omobolanle Adebiyi', 'Oluseyi Oluwabusola'),
    ('Kelvin Esekhile', 'Olushayo Fagbenro'),
    ('David Unuane', 'Olamide Adigun'),
    ('Samuel Oseni', 'Godspower Ochiobi'),
    ('Abraham Giwa', 'Godspower Ochiobi'),
    ('Ibukunoluwa Ajayi', 'Ibijoke Oyewole'),
    ('Korede Asojo', 'Ibijoke Oyewole'),
    ('Oluwapamilerinayo Eniolorunda', 'Ibijoke Oyewole'),
    ('Olayiwola Osho', 'Lawal Abdulateef'),
    ('Daniella Obia', 'Kehinde Akinboni'),
    ('Ayomide Adeosun', 'Ibijoke Oyewole'),
    ('Sopuluchi Obiora', 'Kehinde Akinboni'),
    ('Temitope Oniyide', 'Oluseyi Oluwabusola'),
    ('Bunmi Adejugbe', 'Saheed Amusat'),
    ('Olamide Adigun', 'Ibijoke Oyewole'),
    ('Taofeek Lamidi', 'Lawal Abdulateef'),
    ('Kehinde Akinboni', 'Oluseyi Oluwabusola'),
    ('Osy Ernesto', 'Lawal Abdulateef'),
    ('Victoria Enema', 'Kennedy Osigwe'),
    ('Oluwatobiloba Dokunmu', 'Ayomide Adeosun'),
    ('Adedotun Adebayo', 'Margaret Oduwole'),
    ('Pelumi Oladele', 'Godspower Ochiobi'),
    ('Saviour Nyah', 'Oluseyi Oluwabusola'),
    ('Ayoola Kelani', 'Lawal Abdulateef'),
    ('Segun Oyesanya', 'Olamide Adigun'),
    ('Marcia Cole', 'Lawal Abdulateef'),
    ('Jide Onakoya', 'Lawal Abdulateef'),
    ('Oluwadamilola Aluko', 'Stephen Balogun'),
    ('Oluwatobiloba Adegbite', 'Oluseyi Oluwabusola'),
    ('Tajudeen Yusuf', 'Lawal Abdulateef'),
    ('Oluwapelumi Adejimi', 'Ibijoke Oyewole')
    ) AS t(subject_name, reviewer_name)
  LOOP
    SELECT id INTO subj
    FROM public.employees
    WHERE coalesce(vigipay_appraisal_active, false)
      AND lower(regexp_replace(name, '\s+', ' ', 'g')) = lower(regexp_replace(rec.subject_name, '\s+', ' ', 'g'))
    LIMIT 1;
    SELECT id INTO mgr
    FROM public.employees
    WHERE coalesce(vigipay_appraisal_active, false)
      AND lower(regexp_replace(name, '\s+', ' ', 'g')) = lower(regexp_replace(rec.reviewer_name, '\s+', ' ', 'g'))
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
