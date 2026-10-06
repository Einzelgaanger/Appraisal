-- A person can cover more than one team and hold more than one title.
-- Uloma leads Legal and Operations. The same columns work for anyone else.
-- Greenhouse Capital seats are activated so the org chart includes the whole team.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS additional_departments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS additional_roles text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS additional_departments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS additional_roles text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.employees.additional_departments IS
  'Teams this person covers in addition to employees.department.';
COMMENT ON COLUMN public.employees.additional_roles IS
  'Titles this person holds in addition to employees.role.';

CREATE OR REPLACE FUNCTION public.normalize_label_list(_items text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT array_agg(item ORDER BY item)
    FROM (
      SELECT DISTINCT btrim(x) AS item
      FROM unnest(COALESCE(_items, ARRAY[]::text[])) AS u(x)
      WHERE btrim(COALESCE(x, '')) <> ''
    ) cleaned
  ), ARRAY[]::text[]);
$$;

CREATE OR REPLACE FUNCTION public.labels_except(_items text[], _primary text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT array_agg(item ORDER BY item)
    FROM unnest(public.normalize_label_list(_items)) AS u(item)
    WHERE lower(item) IS DISTINCT FROM lower(btrim(COALESCE(_primary, '')))
  ), ARRAY[]::text[]);
$$;

-- ---------------------------------------------------------------------------
-- Roster: known Greenhouse line, plus every other @greenhouse seat
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ensure_ghc_member(
  _id uuid,
  _name text,
  _email text,
  _role text,
  _department text,
  _level int,
  _greenhouse_seat boolean,
  _force_role boolean,
  _extra_departments text[]
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  found uuid;
  ghc uuid := '22222222-2222-2222-2222-222222222222';
  eo uuid := '11111111-1111-1111-1111-111111111111';
  next_role text;
  next_department text;
BEGIN
  SELECT e.id INTO found
  FROM public.employees e
  WHERE lower(e.email) = lower(_email)
     OR e.id = _id
     OR (
       char_length(btrim(_name)) > 8
       AND e.name ILIKE btrim(_name) || '%'
     )
  ORDER BY
    CASE WHEN lower(e.email) = lower(_email) THEN 0
         WHEN e.id = _id THEN 1
         ELSE 2 END,
    CASE WHEN coalesce(e.ghc_appraisal_active, false) THEN 0 ELSE 1 END
  LIMIT 1;

  IF found IS NULL THEN
    INSERT INTO public.employees (
      id, subsidiary_id, name, email, role, department,
      hierarchy_level, ghc_hierarchy_level, ghc_appraisal_active,
      eo_appraisal_active, additional_departments
    ) VALUES (
      _id,
      CASE WHEN _greenhouse_seat THEN ghc ELSE eo END,
      _name,
      lower(_email),
      _role,
      _department,
      _level,
      _level,
      true,
      NOT _greenhouse_seat,
      public.labels_except(_extra_departments, _department)
    );
    RETURN _id;
  END IF;

  next_role := CASE
    WHEN _force_role OR btrim(COALESCE((SELECT role FROM public.employees WHERE id = found), '')) = '' THEN _role
    ELSE (SELECT role FROM public.employees WHERE id = found)
  END;
  next_department := CASE
    WHEN _force_role
      OR btrim(COALESCE((SELECT department FROM public.employees WHERE id = found), '')) = ''
      OR (SELECT department FROM public.employees WHERE id = found) = 'People'
    THEN _department
    ELSE (SELECT department FROM public.employees WHERE id = found)
  END;

  UPDATE public.employees e
  SET
    ghc_appraisal_active = true,
    ghc_hierarchy_level = _level,
    hierarchy_level = CASE WHEN _greenhouse_seat THEN _level ELSE e.hierarchy_level END,
    role = next_role,
    department = next_department,
    additional_departments = CASE
      WHEN _extra_departments IS NOT NULL THEN public.labels_except(_extra_departments, next_department)
      ELSE e.additional_departments
    END,
    subsidiary_id = CASE WHEN _greenhouse_seat THEN ghc ELSE e.subsidiary_id END
  WHERE e.id = found;

  RETURN found;
END;
$$;

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
  bunmi := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111101', 'Bunmi Akinyemiju', 'bunmi.akinyemiju@venturegardengroup.com', 'CEO', 'Executive', 1, false, false, NULL);
  uloma := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111102', 'Uloma Herrington', 'uloma.herrington@greenhouse.capital', 'Head of Legal & Operations', 'Legal', 2, true, true, ARRAY['Operations']);
  busayo := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111103', 'Busayo Eniola-Giwa', 'busayo.eniola-giwa@greenhouse.capital', 'Investment Lead', 'Investment', 3, true, false, NULL);
  omotola := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111104', 'Omotola Akinyemiju', 'omotola.akinyemiju@greenhouse.capital', 'Finance Lead', 'Finance', 3, true, false, NULL);
  phebean := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111105', 'Phebean Falaye', 'phebean.falaye@greenhouse.capital', 'Operations Lead', 'Operations', 3, true, false, NULL);
  fiyin := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111106', 'Fiyinfoluwa Sanwo', 'fiyinfoluwa.sanwo@venturegardengroup.com', 'People Ops', 'People Ops', 3, false, false, NULL);
  mariam := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111107', 'Mariam Adahunse', 'mariam.adahunse@greenhouse.capital', 'Analyst', 'Investment', 3, true, false, NULL);
  faith := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111108', 'Faith Aminaho', 'faith.aminaho@greenhouse.capital', 'Associate', 'Operations', 4, true, false, NULL);
  anjola := public._ensure_ghc_member('a1111111-1111-4111-8111-111111111109', 'Anjolaoluwa Jawando', 'anjolaoluwa.jawando@greenhouse.capital', 'Associate', 'Finance', 4, true, false, NULL);

  -- Anyone else already stored on a Greenhouse email joins the same roster.
  UPDATE public.employees e
  SET
    ghc_appraisal_active = true,
    subsidiary_id = '22222222-2222-2222-2222-222222222222',
    ghc_hierarchy_level = COALESCE(e.ghc_hierarchy_level, e.hierarchy_level, 3)
  WHERE (
      lower(coalesce(e.email, '')) LIKE '%@greenhouse.capital'
      OR lower(coalesce(e.email, '')) LIKE '%@greenhousecapital.com'
    )
    AND e.name NOT ILIKE '%(vacant)%'
    AND NOT coalesce(e.vigipay_appraisal_active, false);

  IF bunmi IS NOT NULL THEN
    UPDATE public.employees
    SET ghc_hierarchy_level = 1, ghc_manager_id = NULL, ghc_secondary_manager_id = NULL, ghc_appraisal_active = true
    WHERE id = bunmi;
  END IF;

  IF uloma IS NOT NULL THEN
    UPDATE public.employees
    SET ghc_hierarchy_level = 2, ghc_manager_id = bunmi, ghc_secondary_manager_id = NULL,
        manager_id = bunmi, secondary_manager_id = NULL
    WHERE id = uloma;
  END IF;

  UPDATE public.employees
  SET ghc_hierarchy_level = 3, ghc_manager_id = uloma, ghc_secondary_manager_id = NULL,
      manager_id = uloma, secondary_manager_id = NULL
  WHERE id IN (busayo, omotola, phebean);

  IF fiyin IS NOT NULL THEN
    UPDATE public.employees
    SET ghc_hierarchy_level = 3, ghc_manager_id = uloma, ghc_secondary_manager_id = NULL
    WHERE id = fiyin;
  END IF;

  IF mariam IS NOT NULL THEN
    UPDATE public.employees
    SET ghc_hierarchy_level = 3, ghc_manager_id = busayo, ghc_secondary_manager_id = omotola,
        manager_id = busayo, secondary_manager_id = omotola
    WHERE id = mariam;
  END IF;

  IF faith IS NOT NULL THEN
    UPDATE public.employees
    SET ghc_hierarchy_level = 4, ghc_manager_id = phebean, ghc_secondary_manager_id = NULL,
        manager_id = phebean, secondary_manager_id = NULL
    WHERE id = faith;
  END IF;

  IF anjola IS NOT NULL THEN
    UPDATE public.employees
    SET ghc_hierarchy_level = 4, ghc_manager_id = omotola, ghc_secondary_manager_id = NULL,
        manager_id = omotola, secondary_manager_id = NULL
    WHERE id = anjola;
  END IF;

  UPDATE public.profiles p
  SET
    role = e.role,
    department = e.department,
    additional_departments = e.additional_departments,
    additional_roles = e.additional_roles
  FROM public.employees e
  WHERE lower(e.email) = 'uloma.herrington@greenhouse.capital'
    AND (p.employee_id = e.id OR lower(p.email) = lower(e.email));
END $$;

DROP FUNCTION public._ensure_ghc_member(uuid, text, text, text, text, int, boolean, boolean, text[]);

-- ---------------------------------------------------------------------------
-- Profile save keeps extra teams and titles
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_my_profile(text, text, text, text);

CREATE FUNCTION public.update_my_profile(
  _name text,
  _role text,
  _department text DEFAULT NULL,
  _avatar_url text DEFAULT NULL,
  _additional_departments text[] DEFAULT NULL,
  _additional_roles text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid := auth.uid();
  emp uuid := public.current_employee_id();
  clean_name text := btrim(COALESCE(_name, ''));
  clean_role text := btrim(COALESCE(_role, ''));
  clean_dept text := NULLIF(btrim(COALESCE(_department, '')), '');
  clean_avatar text := NULLIF(btrim(COALESCE(_avatar_url, '')), '');
  next_depts text[];
  next_roles text[];
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in.';
  END IF;
  IF char_length(clean_name) < 2 OR char_length(clean_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;
  IF char_length(clean_role) < 2 OR char_length(clean_role) > 160 THEN
    RAISE EXCEPTION 'Please enter your role.';
  END IF;

  next_depts := CASE
    WHEN _additional_departments IS NULL THEN NULL
    ELSE public.labels_except(_additional_departments, clean_dept)
  END;
  next_roles := CASE
    WHEN _additional_roles IS NULL THEN NULL
    ELSE public.labels_except(_additional_roles, clean_role)
  END;

  UPDATE public.profiles
  SET
    name = clean_name,
    role = clean_role,
    department = COALESCE(clean_dept, department),
    avatar_url = CASE WHEN _avatar_url IS NULL THEN avatar_url ELSE clean_avatar END,
    additional_departments = COALESCE(next_depts, additional_departments),
    additional_roles = COALESCE(next_roles, additional_roles)
  WHERE id = me;

  IF emp IS NOT NULL THEN
    UPDATE public.employees
    SET
      name = clean_name,
      role = clean_role,
      department = COALESCE(clean_dept, department),
      avatar_url = CASE WHEN _avatar_url IS NULL THEN avatar_url ELSE clean_avatar END,
      additional_departments = COALESCE(next_depts, additional_departments),
      additional_roles = COALESCE(next_roles, additional_roles)
    WHERE id = emp;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, text, text[], text[]) TO authenticated;

-- Company directory includes the whole appraisal pool, and every team a person covers.
CREATE OR REPLACE FUNCTION public.workspace_company_directory()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  sid uuid := public.workspace_my_subsidiary_id();
  ghc uuid := '22222222-2222-2222-2222-222222222222';
  vigi uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'role', e.role,
      'additional_roles', COALESCE(e.additional_roles, '{}'::text[]),
      'email', e.email,
      'department', e.department,
      'additional_departments', COALESCE(e.additional_departments, '{}'::text[]),
      'avatar_url', e.avatar_url,
      'hierarchy_level', CASE
        WHEN sid IN (ghc, vigi) THEN COALESCE(e.ghc_hierarchy_level, e.hierarchy_level)
        ELSE e.hierarchy_level
      END,
      'manager_id', CASE
        WHEN sid IN (ghc, vigi) THEN COALESCE(e.ghc_manager_id, e.manager_id)
        ELSE e.manager_id
      END,
      'secondary_manager_id', CASE
        WHEN sid IN (ghc, vigi) THEN COALESCE(e.ghc_secondary_manager_id, e.secondary_manager_id)
        ELSE e.secondary_manager_id
      END
    ) ORDER BY COALESCE(e.ghc_hierarchy_level, e.hierarchy_level), e.name)
    FROM public.employees e
    WHERE e.name NOT ILIKE '%(vacant)%'
      AND (
        (sid = ghc AND (e.subsidiary_id = ghc OR public.ghc_member_pool(e.id) = 'ghc'))
        OR (sid = vigi AND (e.subsidiary_id = vigi OR public.ghc_member_pool(e.id) = 'vigipay'))
        OR (sid IS NOT NULL AND sid NOT IN (ghc, vigi) AND e.subsidiary_id = sid)
      )
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_company_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.ghc_get_directory_status(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.ghc_me();
  pool text := coalesce(public.ghc_member_pool(me), 'ghc');
  expected_360 int;
BEGIN
  IF NOT (public.ghc_is_admin() OR public.ghc_is_active_member(me)) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT greatest(count(*) - 1, 0) INTO expected_360
  FROM public.employees e
  WHERE public.ghc_member_pool(e.id) = pool
    AND e.name NOT ILIKE '%(vacant)%';

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.hierarchy_level, t.name)
    FROM (
      SELECT
        e.id,
        e.name,
        e.role,
        COALESCE(e.additional_roles, '{}'::text[]) AS additional_roles,
        e.department,
        COALESCE(e.additional_departments, '{}'::text[]) AS additional_departments,
        COALESCE(e.ghc_hierarchy_level, e.hierarchy_level) AS hierarchy_level,
        coalesce(e.ghc_manager_id, e.manager_id) AS manager_id,
        coalesce(e.ghc_secondary_manager_id, e.secondary_manager_id) AS secondary_manager_id,
        e.email,
        EXISTS (
          SELECT 1 FROM public.ghc_monthly_self_checkins s
          WHERE s.employee_id = e.id AND s.period = _period_month AND s.status = 'submitted'
        ) AS monthly_self_done,
        EXISTS (
          SELECT 1 FROM public.ghc_monthly_reviews m
          WHERE m.report_id = e.id AND m.period = _period_month AND m.status = 'submitted'
        ) AS monthly_done,
        (
          SELECT COUNT(*) FROM public.ghc_360_responses r
          WHERE r.reviewer_id = e.id AND r.period = _period_quarter AND r.status = 'submitted'
        ) AS peer_360_given,
        expected_360 AS peer_360_expected,
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
        AND e.name NOT ILIKE '%(vacant)%'
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ghc_get_directory_status(text, text) TO authenticated;
