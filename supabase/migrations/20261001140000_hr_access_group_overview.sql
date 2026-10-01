-- Fiyin (GHC HR), Bunmi multi-company access, and group-wide appraisal snapshot for leadership.

-- ---------------------------------------------------------------------------
-- 1) GHC People Ops / HR (Fiyin + existing People Ops pattern)
-- ---------------------------------------------------------------------------
UPDATE public.employees e
SET
  company_admin = true,
  ghc_appraisal_active = true
WHERE lower(coalesce(e.email, '')) IN (
  'fiyinfoluwa.sanwo@venturegardengroup.com',
  'fiyin.sanwo@venturegardengroup.com'
)
   OR lower(split_part(coalesce(e.email, ''), '@', 1)) IN ('fiyinfoluwa.sanwo', 'fiyin.sanwo');

UPDATE public.employees e
SET company_admin = true
WHERE coalesce(e.ghc_appraisal_active, false)
  AND (
    lower(split_part(coalesce(e.email, ''), '@', 1)) IN (
      'fiyinfoluwa.sanwo',
      'fiyin.sanwo',
      'uloma.herrington',
      'omotola.akinyemiju',
      'bunmi.akinyemiju'
    )
    OR e.role ILIKE '%people ops%'
    OR e.role ILIKE '%people manager%'
  );

-- ---------------------------------------------------------------------------
-- 2) Group leadership: one login per person, one roster row per subsidiary
-- ---------------------------------------------------------------------------
INSERT INTO public.employee_access (profile_id, employee_id)
SELECT DISTINCT p.id, e.id
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
JOIN public.employees e ON lower(e.email) = lower(u.email)
WHERE lower(u.email) IN (
  'omotola.akinyemiju@greenhouse.capital',
  'ayomide.adeosun@venturegardengroup.com'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.employee_access (profile_id, employee_id)
SELECT p.id, e.id
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
JOIN public.employees e ON lower(e.email) = 'bunmi.akinyemiju@venturegardengroup.com'
WHERE lower(u.email) = 'bunmi.akinyemiju@peopleos.co'
ON CONFLICT DO NOTHING;

INSERT INTO public.employee_access (profile_id, employee_id)
SELECT p.id, e.id
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
JOIN public.employees e ON e.subsidiary_id = public.vigipay_subsidiary_id()
  AND e.name ILIKE 'Bunmi Akinyemiju%'
WHERE lower(u.email) = 'bunmi.akinyemiju@peopleos.co'
ON CONFLICT DO NOTHING;

-- Platform admin for Group CEO (Executive console + cross-company tools)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'bunmi.akinyemiju@peopleos.co'
ON CONFLICT (user_id, role) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Pool stats helper (no ghc_me — used for group overview)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ghc_pool_completion_stats(
  _pool text,
  _period_quarter text,
  _period_month text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  roster int;
  expected_360_pairs int;
BEGIN
  IF _pool NOT IN ('ghc', 'vigipay') THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO roster
  FROM public.employees e
  WHERE public.ghc_member_pool(e.id) = _pool;

  expected_360_pairs := greatest(roster * (roster - 1), 0);

  RETURN jsonb_build_object(
    'roster', roster,
    'monthlySelfSubmitted', (
      SELECT count(*) FROM public.ghc_monthly_self_checkins s
      WHERE s.period = _period_month
        AND s.status = 'submitted'
        AND public.ghc_member_pool(s.employee_id) = _pool
    ),
    'monthlySelfOpen', greatest(roster - (
      SELECT count(*) FROM public.ghc_monthly_self_checkins s
      WHERE s.period = _period_month
        AND s.status = 'submitted'
        AND public.ghc_member_pool(s.employee_id) = _pool
    ), 0),
    'peer360Submitted', (
      SELECT count(*) FROM public.ghc_360_responses r
      WHERE r.period = _period_quarter
        AND r.status = 'submitted'
        AND public.ghc_member_pool(r.reviewee_id) = _pool
    ),
    'peer360Expected', expected_360_pairs,
    'evaluationsSubmitted', (
      SELECT count(*) FROM public.ghc_quarterly_evaluations q
      WHERE q.period = _period_quarter
        AND q.status IN ('submitted', 'acknowledged')
        AND public.ghc_member_pool(q.employee_id) = _pool
    ),
    'evaluationsAcknowledged', (
      SELECT count(*) FROM public.ghc_quarterly_evaluations q
      WHERE q.period = _period_quarter
        AND q.status = 'acknowledged'
        AND public.ghc_member_pool(q.employee_id) = _pool
    ),
    'peer360ReleasedAt', (
      SELECT c.released_at
      FROM public.ghc_cycle_settings c
      WHERE c.subsidiary_id = public.ghc_pool_subsidiary(_pool)
        AND c.kind = 'peer_360'
        AND c.period = _period_quarter
      LIMIT 1
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Group overview: every company this login may access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_companies_appraisal_overview(
  _period_quarter text,
  _period_month text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  access_count int;
  exec_sub uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  exec_roster int;
  exec_360 int;
  exec_360_expected int;
BEGIN
  SELECT count(*)::int INTO access_count
  FROM public.employee_access a
  WHERE a.profile_id = auth.uid();

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR access_count >= 2
  ) THEN
    RAISE EXCEPTION 'Not authorized for group overview';
  END IF;

  SELECT count(*) INTO exec_roster
  FROM public.employees e
  WHERE e.subsidiary_id = exec_sub;

  exec_360_expected := greatest(exec_roster * (exec_roster - 1), 0);

  SELECT count(*) INTO exec_360
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE r.period = _period_quarter
    AND r.status = 'submitted'
    AND f.code = 'peer_360'
    AND r.reviewee_id IN (
      SELECT id FROM public.employees WHERE subsidiary_id = exec_sub
    );

  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY row->>'company_name')
    FROM (
      SELECT jsonb_build_object(
        'employee_id', e.id,
        'company_name', s.name,
        'tenant_slug', t.slug,
        'appraisal_mode', t.appraisal_mode,
        'employee_role', e.role,
        'ghc_stats', CASE
          WHEN public.ghc_member_pool(e.id) IS NOT NULL
            THEN public.ghc_pool_completion_stats(public.ghc_member_pool(e.id), _period_quarter, _period_month)
          ELSE NULL
        END,
        'executive_stats', CASE
          WHEN e.subsidiary_id = exec_sub THEN jsonb_build_object(
            'roster', exec_roster,
            'peer360Submitted', exec_360,
            'peer360Expected', exec_360_expected,
            'peer360Released', public.peer_360_results_released(_period_quarter)
          )
          ELSE NULL
        END
      ) AS row
      FROM public.employee_access a
      JOIN public.employees e ON e.id = a.employee_id
      LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
      LEFT JOIN public.tenants t ON t.subsidiary_id = e.subsidiary_id
      WHERE a.profile_id = auth.uid()
    ) sub
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ghc_pool_completion_stats(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_companies_appraisal_overview(text, text) TO authenticated;
