-- Presentation-ready GHC identity + full roster fix.
-- Resolves dual employee rows (EO login vs GHC seed) so EVERY GHC person gets tasks.

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
  ghc_id uuid;
BEGIN
  me := public.current_employee_id();

  -- Prefer the profile-linked employee when it is already GHC-active (login identity).
  IF me IS NOT NULL AND public.ghc_is_active_member(me) THEN
    RETURN me;
  END IF;

  -- Otherwise map login email → an active GHC employee row (domain may differ).
  SELECT lower(coalesce(p.email, u.email))
  INTO auth_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();

  IF auth_email IS NOT NULL THEN
    SELECT e.id INTO ghc_id
    FROM public.employees e
    WHERE coalesce(e.ghc_appraisal_active, false)
      AND e.email IS NOT NULL
      AND lower(e.email) = auth_email
    ORDER BY CASE WHEN e.id = me THEN 0 ELSE 1 END,
             CASE WHEN e.subsidiary_id = public.ghc_subsidiary_id() THEN 0 ELSE 1 END
    LIMIT 1;

    IF ghc_id IS NOT NULL THEN
      RETURN ghc_id;
    END IF;

    -- Match by local-part when domains differ (peopleos / venturegardengroup / greenhouse)
    SELECT e.id INTO ghc_id
    FROM public.employees e
    WHERE coalesce(e.ghc_appraisal_active, false)
      AND e.email IS NOT NULL
      AND split_part(lower(e.email), '@', 1) = split_part(auth_email, '@', 1)
    ORDER BY CASE WHEN e.id = me THEN 0 ELSE 1 END,
             CASE WHEN e.subsidiary_id = public.ghc_subsidiary_id() THEN 0 ELSE 1 END
    LIMIT 1;

    IF ghc_id IS NOT NULL THEN
      RETURN ghc_id;
    END IF;
  END IF;

  RETURN me;
END;
$$;

-- Activate / upsert the full active GHC roster onto ONE canonical set of IDs.
-- Canonical rule: prefer existing login/EO row when email local-part matches; else GHC seed row.

DO $$
DECLARE
  bunmi uuid;
  uloma uuid;
  busayo uuid;
  omotola uuid;
  phebean uuid;
  fiyin uuid;
  mariam uuid;
  faith uuid;
  anjola uuid;
BEGIN
  -- Resolve each person: prefer any existing row by email local-part, else fixed GHC id
  -- Prefer profile-linked / EO login rows over GHC seed duplicates
  SELECT e.id INTO bunmi
  FROM employees e
  LEFT JOIN profiles p ON p.employee_id = e.id
  WHERE split_part(lower(coalesce(e.email,'')), '@', 1) = 'bunmi.akinyemiju'
     OR e.name ILIKE 'Bunmi Akinyemiju%'
  ORDER BY CASE WHEN p.id IS NOT NULL THEN 0 ELSE 1 END,
           CASE WHEN e.subsidiary_id = '22222222-2222-2222-2222-222222222222' THEN 1 ELSE 0 END,
           e.created_at NULLS LAST
  LIMIT 1;
  bunmi := coalesce(bunmi, 'a1111111-1111-4111-8111-111111111101'::uuid);

  SELECT id INTO uloma FROM employees
  WHERE lower(coalesce(email,'')) = 'uloma.herrington@greenhouse.capital' OR name ILIKE 'Uloma Herrington%'
  ORDER BY CASE WHEN subsidiary_id = '22222222-2222-2222-2222-222222222222' THEN 0 ELSE 1 END
  LIMIT 1;
  uloma := coalesce(uloma, 'a1111111-1111-4111-8111-111111111102'::uuid);

  SELECT id INTO busayo FROM employees
  WHERE lower(coalesce(email,'')) = 'busayo.eniola-giwa@greenhouse.capital' OR name ILIKE 'Busayo Eniola%'
  LIMIT 1;
  busayo := coalesce(busayo, 'a1111111-1111-4111-8111-111111111103'::uuid);

  SELECT e.id INTO omotola
  FROM employees e
  LEFT JOIN profiles p ON p.employee_id = e.id
  WHERE split_part(lower(coalesce(e.email,'')), '@', 1) = 'omotola.akinyemiju'
     OR e.name ILIKE 'Omotola Akinyemiju%'
  ORDER BY CASE WHEN p.id IS NOT NULL THEN 0 ELSE 1 END,
           CASE WHEN e.subsidiary_id = '22222222-2222-2222-2222-222222222222' THEN 1 ELSE 0 END,
           e.created_at NULLS LAST
  LIMIT 1;
  omotola := coalesce(omotola, 'a1111111-1111-4111-8111-111111111104'::uuid);

  SELECT id INTO phebean FROM employees
  WHERE lower(coalesce(email,'')) = 'phebean.falaye@greenhouse.capital' OR name ILIKE 'Phebean%'
  LIMIT 1;
  phebean := coalesce(phebean, 'a1111111-1111-4111-8111-111111111105'::uuid);

  SELECT id INTO fiyin FROM employees
  WHERE split_part(lower(coalesce(email,'')), '@', 1) IN ('fiyinfoluwa.sanwo', 'fiyin.sanwo')
     OR name ILIKE 'Fiyinfoluwa%'
  ORDER BY CASE WHEN coalesce(ghc_appraisal_active,false) THEN 0 ELSE 1 END
  LIMIT 1;
  fiyin := coalesce(fiyin, 'a1111111-1111-4111-8111-111111111106'::uuid);

  SELECT id INTO mariam FROM employees
  WHERE lower(coalesce(email,'')) = 'mariam.adahunse@greenhouse.capital' OR name ILIKE 'Mariam Adahunse%'
  LIMIT 1;
  mariam := coalesce(mariam, 'a1111111-1111-4111-8111-111111111107'::uuid);

  SELECT id INTO faith FROM employees
  WHERE lower(coalesce(email,'')) = 'faith.aminaho@greenhouse.capital' OR name ILIKE 'Faith Aminaho%'
  LIMIT 1;
  faith := coalesce(faith, 'a1111111-1111-4111-8111-111111111108'::uuid);

  SELECT id INTO anjola FROM employees
  WHERE lower(coalesce(email,'')) = 'anjolaoluwa.jawando@greenhouse.capital' OR name ILIKE 'Anjolaoluwa%'
  LIMIT 1;
  anjola := coalesce(anjola, 'a1111111-1111-4111-8111-111111111109'::uuid);

  -- Ensure rows exist for GHC-only people
  INSERT INTO employees (id, subsidiary_id, name, email, role, department, hierarchy_level, eo_appraisal_active, ghc_appraisal_active, ghc_hierarchy_level, sort_order)
  VALUES
    (uloma, '22222222-2222-2222-2222-222222222222', 'Uloma Herrington', 'uloma.herrington@greenhouse.capital', 'Head of Legal', 'Legal', 2, false, true, 2, 2),
    (busayo, '22222222-2222-2222-2222-222222222222', 'Busayo Eniola-Giwa', 'busayo.eniola-giwa@greenhouse.capital', 'Investment Lead', 'Investment', 3, false, true, 3, 3),
    (phebean, '22222222-2222-2222-2222-222222222222', 'Phebean Falaye', 'phebean.falaye@greenhouse.capital', 'Operations Lead', 'Operations', 3, false, true, 3, 5),
    (mariam, '22222222-2222-2222-2222-222222222222', 'Mariam Adahunse', 'mariam.adahunse@greenhouse.capital', 'Analyst', 'Investment', 3, false, true, 3, 7),
    (faith, '22222222-2222-2222-2222-222222222222', 'Faith Aminaho', 'faith.aminaho@greenhouse.capital', 'Associate', 'Operations', 4, false, true, 4, 8),
    (anjola, '22222222-2222-2222-2222-222222222222', 'Anjolaoluwa Jawando', 'anjolaoluwa.jawando@greenhouse.capital', 'Associate', 'Finance', 4, false, true, 4, 9)
  ON CONFLICT (id) DO NOTHING;

  -- Activate ONE canonical row per person (login-preferred where available)
  UPDATE employees SET ghc_appraisal_active = true, ghc_hierarchy_level = 1, ghc_manager_id = NULL, ghc_secondary_manager_id = NULL
  WHERE id = bunmi;

  UPDATE employees SET ghc_appraisal_active = true, ghc_hierarchy_level = 2, ghc_manager_id = bunmi, ghc_secondary_manager_id = NULL
  WHERE id = uloma;

  UPDATE employees SET ghc_appraisal_active = true, ghc_hierarchy_level = 3, ghc_manager_id = uloma, ghc_secondary_manager_id = NULL
  WHERE id IN (busayo, omotola, phebean, fiyin);

  UPDATE employees SET ghc_appraisal_active = true, ghc_hierarchy_level = 3, ghc_manager_id = busayo, ghc_secondary_manager_id = omotola
  WHERE id = mariam;

  UPDATE employees SET ghc_appraisal_active = true, ghc_hierarchy_level = 4, ghc_manager_id = phebean, ghc_secondary_manager_id = NULL
  WHERE id = faith;

  UPDATE employees SET ghc_appraisal_active = true, ghc_hierarchy_level = 4, ghc_manager_id = omotola, ghc_secondary_manager_id = NULL
  WHERE id = anjola;

  -- Deactivate duplicate identity rows so tasks/360s are not doubled
  UPDATE employees SET ghc_appraisal_active = false
  WHERE id IN (
    'a1111111-1111-4111-8111-111111111101'::uuid, -- Bunmi seed duplicate
    'a1111111-1111-4111-8111-111111111104'::uuid  -- Omotola seed duplicate
  )
  AND id IS DISTINCT FROM bunmi
  AND id IS DISTINCT FROM omotola;

  UPDATE employees SET ghc_appraisal_active = false
  WHERE (
      split_part(lower(coalesce(email,'')), '@', 1) = 'bunmi.akinyemiju'
      OR name ILIKE 'Bunmi Akinyemiju%'
    )
    AND id IS DISTINCT FROM bunmi;

  UPDATE employees SET ghc_appraisal_active = false
  WHERE (
      split_part(lower(coalesce(email,'')), '@', 1) = 'omotola.akinyemiju'
      OR name ILIKE 'Omotola Akinyemiju%'
    )
    AND id IS DISTINCT FROM omotola;
END $$;

-- Deduplicate task visibility: when multiple active rows share local-part, keep manager links consistent
-- and ensure ghc_get_my_tasks only lists each person once via DISTINCT ON name/email.

CREATE OR REPLACE FUNCTION public.ghc_get_my_tasks(_period_month text, _period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  tasks jsonb := '[]'::jsonb;
BEGIN
  IF me IS NULL OR NOT public.ghc_is_active_member(me) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Monthly manager reviews
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
    WHERE coalesce(e.ghc_appraisal_active, false)
      AND e.id <> me
      AND (coalesce(e.ghc_manager_id, e.manager_id) = me
           OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
    ORDER BY e.id, e.name
  ) t;

  -- Peer 360 for every other active GHC member (dedupe by email local-part / name)
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
      WHERE coalesce(e.ghc_appraisal_active, false)
        AND e.id <> me
        -- skip other duplicate identity rows for the same person as me
        AND split_part(lower(coalesce(e.email,'')), '@', 1)
            IS DISTINCT FROM split_part(lower(coalesce((SELECT email FROM employees WHERE id = me), '')), '@', 1)
      ORDER BY coalesce(nullif(split_part(lower(coalesce(e.email,'')), '@', 1), ''), e.id::text),
               CASE WHEN e.subsidiary_id = public.ghc_subsidiary_id() THEN 0 ELSE 1 END,
               e.name
    ) t
  ), '[]'::jsonb);

  -- Quarterly evaluations for reports
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
      WHERE coalesce(e.ghc_appraisal_active, false)
        AND e.id <> me
        AND (coalesce(e.ghc_manager_id, e.manager_id) = me
             OR coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
      ORDER BY e.id, e.name
    ) t
  ), '[]'::jsonb);

  -- Acknowledge own submitted evaluation
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
        AND (q.released_at IS NOT NULL OR public.ghc_is_admin())
    ) t
  ), '[]'::jsonb);

  RETURN tasks;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ghc_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_my_tasks(text, text) TO authenticated;

-- Quick visibility check
SELECT id, name, email, ghc_appraisal_active, ghc_hierarchy_level, ghc_manager_id
FROM employees
WHERE coalesce(ghc_appraisal_active, false)
ORDER BY coalesce(ghc_hierarchy_level, 99), name;
