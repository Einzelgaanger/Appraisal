-- GreenHouse Capital appraisal foundation: subsidiary, roster, forms data, RLS, RPCs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Constants
-- ---------------------------------------------------------------------------
-- GHC subsidiary: 22222222-2222-2222-2222-222222222222

INSERT INTO public.subsidiaries (id, name, hierarchy_lower_is_senior)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'GreenHouse Capital',
  true
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    hierarchy_lower_is_senior = EXCLUDED.hierarchy_lower_is_senior;

-- Ensure unique name conflict path if id differs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subsidiaries WHERE id = '22222222-2222-2222-2222-222222222222'
  ) AND EXISTS (
    SELECT 1 FROM public.subsidiaries WHERE name = 'GreenHouse Capital'
  ) THEN
    UPDATE public.subsidiaries
    SET id = '22222222-2222-2222-2222-222222222222',
        hierarchy_lower_is_senior = true
    WHERE name = 'GreenHouse Capital';
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS hierarchy_level integer,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secondary_manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eo_appraisal_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ghc_appraisal_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ghc_hierarchy_level integer,
  ADD COLUMN IF NOT EXISTS ghc_manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ghc_secondary_manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Seed roster
-- Uses fixed IDs for GHC-only people. Shared emails (already on EO roster)
-- are activated via ghc_* columns without changing subsidiary_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ghc_seed_person(
  _id uuid,
  _name text,
  _email text,
  _role text,
  _department text,
  _level integer,
  _manager_id uuid,
  _secondary_manager_id uuid,
  _active boolean,
  _sort integer
)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  existing uuid;
BEGIN
  IF _email IS NOT NULL THEN
    SELECT id INTO existing FROM public.employees WHERE lower(email) = lower(_email) LIMIT 1;
  END IF;

  IF existing IS NOT NULL THEN
    UPDATE public.employees SET
      ghc_appraisal_active = _active,
      ghc_hierarchy_level = _level,
      ghc_manager_id = _manager_id,
      ghc_secondary_manager_id = _secondary_manager_id,
      role = COALESCE(role, _role),
      department = COALESCE(department, _department)
    WHERE id = existing;
    RETURN existing;
  END IF;

  INSERT INTO public.employees (
    id, subsidiary_id, name, email, role, department, hierarchy_level,
    manager_id, secondary_manager_id, eo_appraisal_active, ghc_appraisal_active,
    ghc_hierarchy_level, ghc_manager_id, ghc_secondary_manager_id, sort_order
  ) VALUES (
    _id, '22222222-2222-2222-2222-222222222222', _name, _email, _role, _department, _level,
    _manager_id, _secondary_manager_id, false, _active,
    _level, _manager_id, _secondary_manager_id, _sort
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = COALESCE(EXCLUDED.email, public.employees.email),
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    hierarchy_level = EXCLUDED.hierarchy_level,
    manager_id = EXCLUDED.manager_id,
    secondary_manager_id = EXCLUDED.secondary_manager_id,
    ghc_appraisal_active = EXCLUDED.ghc_appraisal_active,
    ghc_hierarchy_level = EXCLUDED.ghc_hierarchy_level,
    ghc_manager_id = EXCLUDED.ghc_manager_id,
    ghc_secondary_manager_id = EXCLUDED.ghc_secondary_manager_id,
    subsidiary_id = COALESCE(public.employees.subsidiary_id, EXCLUDED.subsidiary_id);

  RETURN _id;
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
  bunmi := public.ghc_seed_person('a1111111-1111-4111-8111-111111111101', 'Bunmi Akinyemiju', 'bunmi.akinyemiju@venturegardengroup.com', 'CEO', 'Executive', 1, NULL, NULL, true, 1);
  uloma := public.ghc_seed_person('a1111111-1111-4111-8111-111111111102', 'Uloma Herrington', 'uloma.herrington@greenhouse.capital', 'Head of Legal', 'Legal', 2, bunmi, NULL, true, 2);
  busayo := public.ghc_seed_person('a1111111-1111-4111-8111-111111111103', 'Busayo Eniola-Giwa', 'busayo.eniola-giwa@greenhouse.capital', 'Investment Lead', 'Investment', 3, uloma, NULL, true, 3);
  omotola := public.ghc_seed_person('a1111111-1111-4111-8111-111111111104', 'Omotola Akinyemiju', 'omotola.akinyemiju@greenhouse.capital', 'Finance Lead', 'Finance', 3, uloma, NULL, true, 4);
  phebean := public.ghc_seed_person('a1111111-1111-4111-8111-111111111105', 'Phebean Falaye', 'phebean.falaye@greenhouse.capital', 'Operations Lead', 'Operations', 3, uloma, NULL, true, 5);
  fiyin := public.ghc_seed_person('a1111111-1111-4111-8111-111111111106', 'Fiyinfoluwa Sanwo', 'fiyinfoluwa.sanwo@venturegardengroup.com', 'People Ops', 'People', 3, uloma, NULL, true, 6);
  mariam := public.ghc_seed_person('a1111111-1111-4111-8111-111111111107', 'Mariam Adahunse', 'mariam.adahunse@greenhouse.capital', 'Analyst', 'Investment', 3, busayo, omotola, true, 7);
  faith := public.ghc_seed_person('a1111111-1111-4111-8111-111111111108', 'Faith Aminaho', 'faith.aminaho@greenhouse.capital', 'Associate', 'Operations', 4, phebean, NULL, true, 8);
  anjola := public.ghc_seed_person('a1111111-1111-4111-8111-111111111109', 'Anjolaoluwa Jawando', 'anjolaoluwa.jawando@greenhouse.capital', 'Associate', 'Finance', 4, omotola, NULL, true, 9);

  PERFORM public.ghc_seed_person('a1111111-1111-4111-8111-111111111110', 'Investment Analyst (vacant)', NULL, 'Investment Analyst', 'Investment', 4, busayo, NULL, false, 10);
  PERFORM public.ghc_seed_person('a1111111-1111-4111-8111-111111111111', 'HR Intern (vacant)', NULL, 'HR Intern', 'People', 4, fiyin, NULL, false, 11);
  PERFORM public.ghc_seed_person('a1111111-1111-4111-8111-111111111112', 'Investment Intern (vacant)', NULL, 'Investment Intern', 'Investment', 5, mariam, NULL, false, 12);
  PERFORM public.ghc_seed_person('a1111111-1111-4111-8111-111111111113', 'Finance Intern (vacant)', NULL, 'Finance Intern', 'Finance', 5, faith, NULL, false, 13);

  -- Re-apply manager links using resolved IDs (handles email-collision remaps)
  UPDATE public.employees SET ghc_manager_id = bunmi, ghc_hierarchy_level = 2 WHERE id = uloma;
  UPDATE public.employees SET ghc_manager_id = uloma, ghc_hierarchy_level = 3 WHERE id IN (busayo, omotola, phebean, fiyin);
  UPDATE public.employees SET ghc_manager_id = busayo, ghc_secondary_manager_id = omotola, ghc_hierarchy_level = 3 WHERE id = mariam;
  UPDATE public.employees SET ghc_manager_id = phebean, ghc_hierarchy_level = 4 WHERE id = faith;
  UPDATE public.employees SET ghc_manager_id = omotola, ghc_hierarchy_level = 4 WHERE id = anjola;
END $$;

-- Link tenant config subsidiary if tenants table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    UPDATE public.tenants
    SET branding = jsonb_set(COALESCE(branding, '{}'::jsonb), '{subsidiaryId}', '"22222222-2222-2222-2222-222222222222"', true)
    WHERE slug = 'ghc';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Operational tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ghc_cycle_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('monthly_manager', 'peer_360', 'quarterly_evaluation')),
  period text NOT NULL,
  opens_at timestamptz,
  closes_at timestamptz,
  released_at timestamptz,
  released_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subsidiary_id, kind, period)
);

CREATE TABLE IF NOT EXISTS public.ghc_monthly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE DEFAULT '22222222-2222-2222-2222-222222222222',
  manager_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  proud_this_month boolean,
  personal_issues boolean,
  company_can_help boolean,
  motivated boolean,
  motivated_why text,
  fulfilled text CHECK (fulfilled IS NULL OR fulfilled IN ('yes', 'neutral', 'no')),
  fulfilled_how text,
  time_off_this_quarter boolean,
  looking_forward_personal boolean,
  looking_forward_work boolean,
  meeting_okrs boolean,
  displaying_growth boolean,
  strong_relationship boolean,
  policy_feedback text,
  culture_founders_lps integer CHECK (culture_founders_lps IS NULL OR culture_founders_lps BETWEEN 1 AND 5),
  culture_curious integer CHECK (culture_curious IS NULL OR culture_curious BETWEEN 1 AND 5),
  culture_move_fast integer CHECK (culture_move_fast IS NULL OR culture_move_fast BETWEEN 1 AND 5),
  culture_overachievement integer CHECK (culture_overachievement IS NULL OR culture_overachievement BETWEEN 1 AND 5),
  culture_job_done integer CHECK (culture_job_done IS NULL OR culture_job_done BETWEEN 1 AND 5),
  feedback_to_report text,
  feedback_from_report text,
  additional_comments text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_id, report_id, period)
);

CREATE TABLE IF NOT EXISTS public.ghc_360_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE DEFAULT '22222222-2222-2222-2222-222222222222',
  reviewer_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  score_founders_lps integer CHECK (score_founders_lps IS NULL OR score_founders_lps BETWEEN 1 AND 5),
  example_founders_lps text,
  score_curious integer CHECK (score_curious IS NULL OR score_curious BETWEEN 1 AND 5),
  example_curious text,
  score_move_fast integer CHECK (score_move_fast IS NULL OR score_move_fast BETWEEN 1 AND 5),
  example_move_fast text,
  score_overachievement integer CHECK (score_overachievement IS NULL OR score_overachievement BETWEEN 1 AND 5),
  example_overachievement text,
  score_job_done integer CHECK (score_job_done IS NULL OR score_job_done BETWEEN 1 AND 5),
  example_job_done text,
  did_well text,
  additional_comments text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reviewer_id, reviewee_id, period),
  CHECK (reviewer_id <> reviewee_id)
);

CREATE TABLE IF NOT EXISTS public.ghc_quarterly_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NOT NULL REFERENCES public.subsidiaries(id) ON DELETE CASCADE DEFAULT '22222222-2222-2222-2222-222222222222',
  manager_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period text NOT NULL,
  review_type text NOT NULL DEFAULT 'Q' CHECK (review_type IN ('Q1', 'Q2', 'Q3', 'Q4', 'Annual')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'acknowledged')),
  score_technical integer CHECK (score_technical IS NULL OR score_technical BETWEEN 0 AND 5),
  comment_technical text,
  score_founders_lps integer CHECK (score_founders_lps IS NULL OR score_founders_lps BETWEEN 0 AND 5),
  comment_founders_lps text,
  score_curious integer CHECK (score_curious IS NULL OR score_curious BETWEEN 0 AND 5),
  comment_curious text,
  score_move_fast integer CHECK (score_move_fast IS NULL OR score_move_fast BETWEEN 0 AND 5),
  comment_move_fast text,
  score_overachievement integer CHECK (score_overachievement IS NULL OR score_overachievement BETWEEN 0 AND 5),
  comment_overachievement text,
  score_job_done integer CHECK (score_job_done IS NULL OR score_job_done BETWEEN 0 AND 5),
  comment_job_done text,
  score_growth integer CHECK (score_growth IS NULL OR score_growth BETWEEN 0 AND 5),
  comment_growth text,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvement_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  culture_weight_score numeric,
  technical_weight_score numeric,
  growth_weight_score numeric,
  total_score numeric,
  total_pct numeric,
  band_rating integer,
  employee_understanding text,
  employee_response text,
  acknowledged_at timestamptz,
  submitted_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_id, employee_id, period)
);

CREATE TABLE IF NOT EXISTS public.ghc_partner_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.ghc_quarterly_evaluations(id) ON DELETE CASCADE,
  action_option text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  comments_by_hr text,
  recommendation_by_manager text,
  recommendation_by_hr text,
  partners_decision text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, action_option)
);

CREATE TABLE IF NOT EXISTS public.ghc_evaluation_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL UNIQUE REFERENCES public.ghc_quarterly_evaluations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ghc_evaluation_discussion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL REFERENCES public.ghc_evaluation_discussions(id) ON DELETE CASCADE,
  author_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ghc_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  period text,
  title text NOT NULL,
  body text NOT NULL,
  href text NOT NULL DEFAULT '/hub?tab=survey',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ghc_monthly_manager_period_idx ON public.ghc_monthly_reviews (manager_id, period);
CREATE INDEX IF NOT EXISTS ghc_360_reviewee_period_idx ON public.ghc_360_responses (reviewee_id, period);
CREATE INDEX IF NOT EXISTS ghc_eval_employee_period_idx ON public.ghc_quarterly_evaluations (employee_id, period);
CREATE INDEX IF NOT EXISTS ghc_notifications_recipient_idx ON public.ghc_notifications (recipient_employee_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ghc_subsidiary_id()
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT '22222222-2222-2222-2222-222222222222'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.ghc_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.ghc_me()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_employee_id();
$$;

CREATE OR REPLACE FUNCTION public.ghc_is_active_member(_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id
      AND COALESCE(e.ghc_appraisal_active, false)
  );
$$;

CREATE OR REPLACE FUNCTION public.ghc_manages(_manager_id uuid, _report_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _report_id
      AND COALESCE(e.ghc_appraisal_active, false)
      AND (
        COALESCE(e.ghc_manager_id, e.manager_id) = _manager_id
        OR COALESCE(e.ghc_secondary_manager_id, e.secondary_manager_id) = _manager_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.ghc_compute_evaluation_scores(
  _score_technical integer,
  _score_founders_lps integer,
  _score_curious integer,
  _score_move_fast integer,
  _score_overachievement integer,
  _score_job_done integer,
  _score_growth integer
)
RETURNS TABLE (
  culture_weight_score numeric,
  technical_weight_score numeric,
  growth_weight_score numeric,
  total_score numeric,
  total_pct numeric,
  band_rating integer
)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  c numeric;
  t numeric;
  g numeric;
  tot numeric;
  pct numeric;
  band integer;
BEGIN
  c := LEAST(25::numeric, COALESCE(_score_founders_lps,0) + COALESCE(_score_curious,0) + COALESCE(_score_move_fast,0)
       + COALESCE(_score_overachievement,0) + COALESCE(_score_job_done,0));
  t := LEAST(5::numeric, COALESCE(_score_technical, 0));
  g := LEAST(5::numeric, COALESCE(_score_growth, 0));
  tot := c + t + g;
  pct := ROUND((tot / 35.0) * 100.0, 2);
  band := CASE
    WHEN pct >= 85 THEN 5
    WHEN pct >= 71 THEN 4
    WHEN pct >= 61 THEN 3
    WHEN pct >= 50 THEN 2
    ELSE 1
  END;
  RETURN QUERY SELECT c, t, g, tot, pct, band;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.ghc_cycle_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_monthly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_360_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_quarterly_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_partner_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_evaluation_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_evaluation_discussion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghc_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ghc_cycle_select ON public.ghc_cycle_settings;
CREATE POLICY ghc_cycle_select ON public.ghc_cycle_settings FOR SELECT TO authenticated
USING (subsidiary_id = public.ghc_subsidiary_id() AND (public.ghc_is_admin() OR public.ghc_is_active_member(public.ghc_me())));

DROP POLICY IF EXISTS ghc_cycle_admin ON public.ghc_cycle_settings;
CREATE POLICY ghc_cycle_admin ON public.ghc_cycle_settings FOR ALL TO authenticated
USING (public.ghc_is_admin()) WITH CHECK (public.ghc_is_admin());

DROP POLICY IF EXISTS ghc_monthly_select ON public.ghc_monthly_reviews;
CREATE POLICY ghc_monthly_select ON public.ghc_monthly_reviews FOR SELECT TO authenticated
USING (
  public.ghc_is_admin()
  OR manager_id = public.ghc_me()
  OR (report_id = public.ghc_me() AND status = 'submitted')
);

DROP POLICY IF EXISTS ghc_monthly_write ON public.ghc_monthly_reviews;
CREATE POLICY ghc_monthly_write ON public.ghc_monthly_reviews FOR ALL TO authenticated
USING (public.ghc_is_admin() OR manager_id = public.ghc_me())
WITH CHECK (public.ghc_is_admin() OR manager_id = public.ghc_me());

DROP POLICY IF EXISTS ghc_360_select ON public.ghc_360_responses;
CREATE POLICY ghc_360_select ON public.ghc_360_responses FOR SELECT TO authenticated
USING (
  public.ghc_is_admin()
  OR reviewer_id = public.ghc_me()
  -- reviewee never reads raw rows (aggregate RPC only)
);

DROP POLICY IF EXISTS ghc_360_write ON public.ghc_360_responses;
CREATE POLICY ghc_360_write ON public.ghc_360_responses FOR ALL TO authenticated
USING (public.ghc_is_admin() OR reviewer_id = public.ghc_me())
WITH CHECK (public.ghc_is_admin() OR reviewer_id = public.ghc_me());

DROP POLICY IF EXISTS ghc_eval_select ON public.ghc_quarterly_evaluations;
CREATE POLICY ghc_eval_select ON public.ghc_quarterly_evaluations FOR SELECT TO authenticated
USING (
  public.ghc_is_admin()
  OR manager_id = public.ghc_me()
  OR (employee_id = public.ghc_me() AND (status IN ('submitted', 'acknowledged') OR released_at IS NOT NULL))
);

DROP POLICY IF EXISTS ghc_eval_write ON public.ghc_quarterly_evaluations;
CREATE POLICY ghc_eval_write ON public.ghc_quarterly_evaluations FOR ALL TO authenticated
USING (public.ghc_is_admin() OR manager_id = public.ghc_me() OR employee_id = public.ghc_me())
WITH CHECK (public.ghc_is_admin() OR manager_id = public.ghc_me() OR employee_id = public.ghc_me());

DROP POLICY IF EXISTS ghc_partner_select ON public.ghc_partner_recommendations;
CREATE POLICY ghc_partner_select ON public.ghc_partner_recommendations FOR SELECT TO authenticated
USING (
  public.ghc_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.ghc_quarterly_evaluations e
    WHERE e.id = evaluation_id AND (e.manager_id = public.ghc_me() OR e.employee_id = public.ghc_me())
  )
);

DROP POLICY IF EXISTS ghc_partner_write ON public.ghc_partner_recommendations;
CREATE POLICY ghc_partner_write ON public.ghc_partner_recommendations FOR ALL TO authenticated
USING (public.ghc_is_admin())
WITH CHECK (public.ghc_is_admin());

DROP POLICY IF EXISTS ghc_disc_select ON public.ghc_evaluation_discussions;
CREATE POLICY ghc_disc_select ON public.ghc_evaluation_discussions FOR SELECT TO authenticated
USING (
  public.ghc_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.ghc_quarterly_evaluations e
    WHERE e.id = evaluation_id AND (e.manager_id = public.ghc_me() OR e.employee_id = public.ghc_me())
  )
);

DROP POLICY IF EXISTS ghc_disc_write ON public.ghc_evaluation_discussions;
CREATE POLICY ghc_disc_write ON public.ghc_evaluation_discussions FOR ALL TO authenticated
USING (
  public.ghc_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.ghc_quarterly_evaluations e
    WHERE e.id = evaluation_id AND (e.manager_id = public.ghc_me() OR e.employee_id = public.ghc_me())
  )
)
WITH CHECK (
  public.ghc_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.ghc_quarterly_evaluations e
    WHERE e.id = evaluation_id AND (e.manager_id = public.ghc_me() OR e.employee_id = public.ghc_me())
  )
);

DROP POLICY IF EXISTS ghc_disc_msg_select ON public.ghc_evaluation_discussion_messages;
CREATE POLICY ghc_disc_msg_select ON public.ghc_evaluation_discussion_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ghc_evaluation_discussions d
    JOIN public.ghc_quarterly_evaluations e ON e.id = d.evaluation_id
    WHERE d.id = discussion_id
      AND (public.ghc_is_admin() OR e.manager_id = public.ghc_me() OR e.employee_id = public.ghc_me())
  )
);

DROP POLICY IF EXISTS ghc_disc_msg_insert ON public.ghc_evaluation_discussion_messages;
CREATE POLICY ghc_disc_msg_insert ON public.ghc_evaluation_discussion_messages FOR INSERT TO authenticated
WITH CHECK (author_employee_id = public.ghc_me());

DROP POLICY IF EXISTS ghc_notif_select ON public.ghc_notifications;
CREATE POLICY ghc_notif_select ON public.ghc_notifications FOR SELECT TO authenticated
USING (recipient_employee_id = public.ghc_me() OR public.ghc_is_admin());

DROP POLICY IF EXISTS ghc_notif_update ON public.ghc_notifications;
CREATE POLICY ghc_notif_update ON public.ghc_notifications FOR UPDATE TO authenticated
USING (recipient_employee_id = public.ghc_me())
WITH CHECK (recipient_employee_id = public.ghc_me());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghc_cycle_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghc_monthly_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghc_360_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghc_quarterly_evaluations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghc_partner_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghc_evaluation_discussions TO authenticated;
GRANT SELECT, INSERT ON public.ghc_evaluation_discussion_messages TO authenticated;
GRANT SELECT, UPDATE ON public.ghc_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ghc_create_notification(
  _employee_id uuid,
  _event_type text,
  _title text,
  _body text,
  _href text DEFAULT '/hub?tab=survey',
  _period text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nid uuid;
BEGIN
  INSERT INTO public.ghc_notifications (recipient_employee_id, event_type, period, title, body, href)
  VALUES (_employee_id, _event_type, _period, _title, _body, COALESCE(_href, '/hub?tab=survey'))
  RETURNING id INTO nid;
  RETURN nid;
END;
$$;

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

  -- Monthly manager reviews for direct + secondary reports
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name), '[]'::jsonb)
  INTO tasks
  FROM (
    SELECT
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
    WHERE COALESCE(e.ghc_appraisal_active, false)
      AND (COALESCE(e.ghc_manager_id, e.manager_id) = me OR COALESCE(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
  ) t;

  -- Peer 360 for every other active GHC member
  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name)
    FROM (
      SELECT
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
      WHERE COALESCE(e.ghc_appraisal_active, false)
        AND e.id <> me
    ) t
  ), '[]'::jsonb);

  -- Quarterly evaluations for reports
  tasks := tasks || COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.subject_name)
    FROM (
      SELECT
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
      WHERE COALESCE(e.ghc_appraisal_active, false)
        AND (COALESCE(e.ghc_manager_id, e.manager_id) = me OR COALESCE(e.ghc_secondary_manager_id, e.secondary_manager_id) = me)
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

CREATE OR REPLACE FUNCTION public.ghc_upsert_monthly_review(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  rid uuid;
  report uuid := (_payload->>'report_id')::uuid;
  period text := _payload->>'period';
  st text := COALESCE(_payload->>'status', 'draft');
BEGIN
  IF me IS NULL OR NOT public.ghc_manages(me, report) THEN
    IF NOT public.ghc_is_admin() THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
  END IF;

  INSERT INTO public.ghc_monthly_reviews AS m (
    id, manager_id, report_id, period, status,
    proud_this_month, personal_issues, company_can_help, motivated, motivated_why,
    fulfilled, fulfilled_how, time_off_this_quarter, looking_forward_personal, looking_forward_work,
    meeting_okrs, displaying_growth, strong_relationship, policy_feedback,
    culture_founders_lps, culture_curious, culture_move_fast, culture_overachievement, culture_job_done,
    feedback_to_report, feedback_from_report, additional_comments,
    submitted_at, updated_at
  )
  VALUES (
    COALESCE((_payload->>'id')::uuid, gen_random_uuid()),
    COALESCE((_payload->>'manager_id')::uuid, me),
    report,
    period,
    st,
    (_payload->>'proud_this_month')::boolean,
    (_payload->>'personal_issues')::boolean,
    (_payload->>'company_can_help')::boolean,
    (_payload->>'motivated')::boolean,
    _payload->>'motivated_why',
    _payload->>'fulfilled',
    _payload->>'fulfilled_how',
    (_payload->>'time_off_this_quarter')::boolean,
    (_payload->>'looking_forward_personal')::boolean,
    (_payload->>'looking_forward_work')::boolean,
    (_payload->>'meeting_okrs')::boolean,
    (_payload->>'displaying_growth')::boolean,
    (_payload->>'strong_relationship')::boolean,
    _payload->>'policy_feedback',
    (_payload->>'culture_founders_lps')::integer,
    (_payload->>'culture_curious')::integer,
    (_payload->>'culture_move_fast')::integer,
    (_payload->>'culture_overachievement')::integer,
    (_payload->>'culture_job_done')::integer,
    _payload->>'feedback_to_report',
    _payload->>'feedback_from_report',
    _payload->>'additional_comments',
    CASE WHEN st = 'submitted' THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (manager_id, report_id, period) DO UPDATE SET
    status = EXCLUDED.status,
    proud_this_month = EXCLUDED.proud_this_month,
    personal_issues = EXCLUDED.personal_issues,
    company_can_help = EXCLUDED.company_can_help,
    motivated = EXCLUDED.motivated,
    motivated_why = EXCLUDED.motivated_why,
    fulfilled = EXCLUDED.fulfilled,
    fulfilled_how = EXCLUDED.fulfilled_how,
    time_off_this_quarter = EXCLUDED.time_off_this_quarter,
    looking_forward_personal = EXCLUDED.looking_forward_personal,
    looking_forward_work = EXCLUDED.looking_forward_work,
    meeting_okrs = EXCLUDED.meeting_okrs,
    displaying_growth = EXCLUDED.displaying_growth,
    strong_relationship = EXCLUDED.strong_relationship,
    policy_feedback = EXCLUDED.policy_feedback,
    culture_founders_lps = EXCLUDED.culture_founders_lps,
    culture_curious = EXCLUDED.culture_curious,
    culture_move_fast = EXCLUDED.culture_move_fast,
    culture_overachievement = EXCLUDED.culture_overachievement,
    culture_job_done = EXCLUDED.culture_job_done,
    feedback_to_report = EXCLUDED.feedback_to_report,
    feedback_from_report = EXCLUDED.feedback_from_report,
    additional_comments = EXCLUDED.additional_comments,
    submitted_at = CASE WHEN EXCLUDED.status = 'submitted' THEN COALESCE(m.submitted_at, now()) ELSE m.submitted_at END,
    updated_at = now()
  RETURNING id INTO rid;

  IF st = 'submitted' THEN
    PERFORM public.ghc_create_notification(
      report, 'monthly_review_submitted',
      'Your monthly review was submitted',
      'Your manager submitted this month''s 1:1 review.',
      '/hub?tab=survey', period
    );
  END IF;

  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_upsert_360(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  rid uuid;
  reviewee uuid := (_payload->>'reviewee_id')::uuid;
  period text := _payload->>'period';
  st text := COALESCE(_payload->>'status', 'draft');
BEGIN
  IF me IS NULL OR NOT public.ghc_is_active_member(me) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF reviewee = me THEN
    RAISE EXCEPTION 'Cannot review yourself';
  END IF;

  INSERT INTO public.ghc_360_responses AS r (
    id, reviewer_id, reviewee_id, period, status,
    score_founders_lps, example_founders_lps,
    score_curious, example_curious,
    score_move_fast, example_move_fast,
    score_overachievement, example_overachievement,
    score_job_done, example_job_done,
    did_well, additional_comments, submitted_at, updated_at
  ) VALUES (
    COALESCE((_payload->>'id')::uuid, gen_random_uuid()),
    me, reviewee, period, st,
    (_payload->>'score_founders_lps')::integer, _payload->>'example_founders_lps',
    (_payload->>'score_curious')::integer, _payload->>'example_curious',
    (_payload->>'score_move_fast')::integer, _payload->>'example_move_fast',
    (_payload->>'score_overachievement')::integer, _payload->>'example_overachievement',
    (_payload->>'score_job_done')::integer, _payload->>'example_job_done',
    _payload->>'did_well', _payload->>'additional_comments',
    CASE WHEN st = 'submitted' THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (reviewer_id, reviewee_id, period) DO UPDATE SET
    status = EXCLUDED.status,
    score_founders_lps = EXCLUDED.score_founders_lps,
    example_founders_lps = EXCLUDED.example_founders_lps,
    score_curious = EXCLUDED.score_curious,
    example_curious = EXCLUDED.example_curious,
    score_move_fast = EXCLUDED.score_move_fast,
    example_move_fast = EXCLUDED.example_move_fast,
    score_overachievement = EXCLUDED.score_overachievement,
    example_overachievement = EXCLUDED.example_overachievement,
    score_job_done = EXCLUDED.score_job_done,
    example_job_done = EXCLUDED.example_job_done,
    did_well = EXCLUDED.did_well,
    additional_comments = EXCLUDED.additional_comments,
    submitted_at = CASE WHEN EXCLUDED.status = 'submitted' THEN COALESCE(r.submitted_at, now()) ELSE r.submitted_at END,
    updated_at = now()
  RETURNING id INTO rid;

  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_get_my_360_aggregate(_period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  released boolean := false;
  peer_count integer := 0;
  result jsonb;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('released', false, 'peerCount', 0, 'scores', '[]'::jsonb, 'themes', '[]'::jsonb);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ghc_cycle_settings
    WHERE subsidiary_id = public.ghc_subsidiary_id()
      AND kind = 'peer_360'
      AND period = _period_quarter
      AND released_at IS NOT NULL
  ) INTO released;

  IF NOT released AND NOT public.ghc_is_admin() THEN
    SELECT COUNT(*) INTO peer_count
    FROM public.ghc_360_responses
    WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted';
    RETURN jsonb_build_object('released', false, 'peerCount', peer_count, 'scores', '[]'::jsonb, 'themes', '[]'::jsonb);
  END IF;

  SELECT COUNT(*) INTO peer_count
  FROM public.ghc_360_responses
  WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted';

  SELECT jsonb_build_object(
    'released', true,
    'peerCount', peer_count,
    'scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', k, 'label', l, 'avg', avg_score) ORDER BY ord)
      FROM (
        SELECT 1 ord, 'founders_lps' k, 'We only succeed when our founders and LPs succeed' l, ROUND(AVG(score_founders_lps)::numeric, 2) avg_score
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        UNION ALL
        SELECT 2, 'curious', 'Be voraciously curious', ROUND(AVG(score_curious)::numeric, 2)
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        UNION ALL
        SELECT 3, 'move_fast', 'Move fast and be detail oriented', ROUND(AVG(score_move_fast)::numeric, 2)
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        UNION ALL
        SELECT 4, 'overachievement', 'We only settle for overachievement', ROUND(AVG(score_overachievement)::numeric, 2)
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        UNION ALL
        SELECT 5, 'job_done', 'Your job isn''t done until the job is done', ROUND(AVG(score_job_done)::numeric, 2)
        FROM public.ghc_360_responses WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
      ) s
    ), '[]'::jsonb),
    'themes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('text', did_well) ORDER BY submitted_at)
      FROM public.ghc_360_responses
      WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted'
        AND did_well IS NOT NULL AND length(trim(did_well)) > 0
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_upsert_quarterly_evaluation(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  eid uuid;
  employee uuid := (_payload->>'employee_id')::uuid;
  period text := _payload->>'period';
  st text := COALESCE(_payload->>'status', 'draft');
  scores record;
BEGIN
  IF me IS NULL OR (NOT public.ghc_manages(me, employee) AND NOT public.ghc_is_admin()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO scores FROM public.ghc_compute_evaluation_scores(
    (_payload->>'score_technical')::integer,
    (_payload->>'score_founders_lps')::integer,
    (_payload->>'score_curious')::integer,
    (_payload->>'score_move_fast')::integer,
    (_payload->>'score_overachievement')::integer,
    (_payload->>'score_job_done')::integer,
    (_payload->>'score_growth')::integer
  );

  INSERT INTO public.ghc_quarterly_evaluations AS q (
    id, manager_id, employee_id, period, review_type, status,
    score_technical, comment_technical,
    score_founders_lps, comment_founders_lps,
    score_curious, comment_curious,
    score_move_fast, comment_move_fast,
    score_overachievement, comment_overachievement,
    score_job_done, comment_job_done,
    score_growth, comment_growth,
    strengths, improvements, improvement_goals,
    culture_weight_score, technical_weight_score, growth_weight_score,
    total_score, total_pct, band_rating,
    submitted_at, updated_at
  ) VALUES (
    COALESCE((_payload->>'id')::uuid, gen_random_uuid()),
    COALESCE((_payload->>'manager_id')::uuid, me),
    employee,
    period,
    COALESCE(_payload->>'review_type', 'Q1'),
    st,
    (_payload->>'score_technical')::integer, _payload->>'comment_technical',
    (_payload->>'score_founders_lps')::integer, _payload->>'comment_founders_lps',
    (_payload->>'score_curious')::integer, _payload->>'comment_curious',
    (_payload->>'score_move_fast')::integer, _payload->>'comment_move_fast',
    (_payload->>'score_overachievement')::integer, _payload->>'comment_overachievement',
    (_payload->>'score_job_done')::integer, _payload->>'comment_job_done',
    (_payload->>'score_growth')::integer, _payload->>'comment_growth',
    COALESCE(_payload->'strengths', '[]'::jsonb),
    COALESCE(_payload->'improvements', '[]'::jsonb),
    COALESCE(_payload->'improvement_goals', '[]'::jsonb),
    scores.culture_weight_score, scores.technical_weight_score, scores.growth_weight_score,
    scores.total_score, scores.total_pct, scores.band_rating,
    CASE WHEN st = 'submitted' THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (manager_id, employee_id, period) DO UPDATE SET
    review_type = EXCLUDED.review_type,
    status = EXCLUDED.status,
    score_technical = EXCLUDED.score_technical,
    comment_technical = EXCLUDED.comment_technical,
    score_founders_lps = EXCLUDED.score_founders_lps,
    comment_founders_lps = EXCLUDED.comment_founders_lps,
    score_curious = EXCLUDED.score_curious,
    comment_curious = EXCLUDED.comment_curious,
    score_move_fast = EXCLUDED.score_move_fast,
    comment_move_fast = EXCLUDED.comment_move_fast,
    score_overachievement = EXCLUDED.score_overachievement,
    comment_overachievement = EXCLUDED.comment_overachievement,
    score_job_done = EXCLUDED.score_job_done,
    comment_job_done = EXCLUDED.comment_job_done,
    score_growth = EXCLUDED.score_growth,
    comment_growth = EXCLUDED.comment_growth,
    strengths = EXCLUDED.strengths,
    improvements = EXCLUDED.improvements,
    improvement_goals = EXCLUDED.improvement_goals,
    culture_weight_score = EXCLUDED.culture_weight_score,
    technical_weight_score = EXCLUDED.technical_weight_score,
    growth_weight_score = EXCLUDED.growth_weight_score,
    total_score = EXCLUDED.total_score,
    total_pct = EXCLUDED.total_pct,
    band_rating = EXCLUDED.band_rating,
    submitted_at = CASE WHEN EXCLUDED.status = 'submitted' THEN COALESCE(q.submitted_at, now()) ELSE q.submitted_at END,
    updated_at = now()
  RETURNING id INTO eid;

  -- Ensure partner recommendation rows exist
  INSERT INTO public.ghc_partner_recommendations (evaluation_id, action_option, sort_order)
  SELECT eid, a.action, a.ord
  FROM (VALUES
    ('Promote to new level', 1),
    ('Salary Review', 2),
    ('Reward with Spot Bonus', 3),
    ('Confirm Resource?', 4),
    ('Growth Coaching', 5),
    ('Performance Improvement Plan', 6),
    ('Demotion', 7),
    ('No Action Required', 8)
  ) AS a(action, ord)
  ON CONFLICT (evaluation_id, action_option) DO NOTHING;

  IF st = 'submitted' THEN
    PERFORM public.ghc_create_notification(
      employee, 'evaluation_submitted',
      'Your quarterly evaluation is ready',
      'Your manager submitted your quarterly performance evaluation.',
      '/hub?tab=survey', period
    );
  END IF;

  RETURN eid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_acknowledge_evaluation(
  _evaluation_id uuid,
  _understanding text,
  _employee_response text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  eval public.ghc_quarterly_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO eval FROM public.ghc_quarterly_evaluations WHERE id = _evaluation_id;
  IF eval.id IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF eval.employee_id <> me AND NOT public.ghc_is_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;

  UPDATE public.ghc_quarterly_evaluations
  SET employee_understanding = _understanding,
      employee_response = _employee_response,
      status = 'acknowledged',
      acknowledged_at = now(),
      updated_at = now()
  WHERE id = _evaluation_id;

  INSERT INTO public.ghc_evaluation_discussions (evaluation_id)
  VALUES (_evaluation_id)
  ON CONFLICT (evaluation_id) DO NOTHING;

  PERFORM public.ghc_create_notification(
    eval.manager_id, 'evaluation_acknowledged',
    'Evaluation acknowledged',
    'Your direct report acknowledged their quarterly evaluation.',
    '/hub?tab=survey', eval.period
  );

  RETURN _evaluation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_upsert_partner_recommendation(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid uuid;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    -- Allow managers to fill recommendation_by_manager only
    NULL;
  END IF;

  UPDATE public.ghc_partner_recommendations
  SET comments_by_hr = COALESCE(_payload->>'comments_by_hr', comments_by_hr),
      recommendation_by_manager = COALESCE(_payload->>'recommendation_by_manager', recommendation_by_manager),
      recommendation_by_hr = COALESCE(_payload->>'recommendation_by_hr', recommendation_by_hr),
      partners_decision = COALESCE(_payload->>'partners_decision', partners_decision),
      updated_at = now()
  WHERE id = (_payload->>'id')::uuid
     OR (evaluation_id = (_payload->>'evaluation_id')::uuid AND action_option = _payload->>'action_option')
  RETURNING id INTO rid;

  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_release_period(_kind text, _period text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid uuid;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  INSERT INTO public.ghc_cycle_settings (subsidiary_id, kind, period, released_at, released_by)
  VALUES (public.ghc_subsidiary_id(), _kind, _period, now(), public.ghc_me())
  ON CONFLICT (subsidiary_id, kind, period) DO UPDATE
  SET released_at = now(), released_by = public.ghc_me()
  RETURNING id INTO sid;

  IF _kind = 'peer_360' THEN
    INSERT INTO public.ghc_notifications (recipient_employee_id, event_type, period, title, body, href)
    SELECT e.id, 'peer_360_released', _period, '360 results released',
           'Your anonymous peer 360 aggregate is now available.',
           '/hub?tab=dashboard'
    FROM public.employees e
    WHERE COALESCE(e.ghc_appraisal_active, false);
  END IF;

  RETURN sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_get_directory_status(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.ghc_is_admin() OR public.ghc_is_active_member(public.ghc_me())) THEN
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
        e.manager_id,
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
      WHERE COALESCE(e.ghc_appraisal_active, false)
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_admin_completion_summary(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  roster integer;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT COUNT(*) INTO roster
  FROM public.employees
  WHERE COALESCE(ghc_appraisal_active, false);

  RETURN jsonb_build_object(
    'roster', roster,
    'monthlySubmitted', (SELECT COUNT(*) FROM public.ghc_monthly_reviews WHERE period = _period_month AND status = 'submitted'),
    'peer360Submitted', (SELECT COUNT(*) FROM public.ghc_360_responses WHERE period = _period_quarter AND status = 'submitted'),
    'evaluationsSubmitted', (SELECT COUNT(*) FROM public.ghc_quarterly_evaluations WHERE period = _period_quarter AND status IN ('submitted', 'acknowledged')),
    'evaluationsAcknowledged', (SELECT COUNT(*) FROM public.ghc_quarterly_evaluations WHERE period = _period_quarter AND status = 'acknowledged')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_get_evaluation_discussion(_evaluation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  did uuid;
BEGIN
  SELECT id INTO did FROM public.ghc_evaluation_discussions WHERE evaluation_id = _evaluation_id;
  IF did IS NULL THEN
    RETURN jsonb_build_object('discussionId', null, 'messages', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'discussionId', did,
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'authorId', m.author_employee_id,
        'authorName', e.name,
        'body', m.body,
        'createdAt', m.created_at
      ) ORDER BY m.created_at)
      FROM public.ghc_evaluation_discussion_messages m
      JOIN public.employees e ON e.id = m.author_employee_id
      WHERE m.discussion_id = did
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_post_evaluation_discussion_message(_evaluation_id uuid, _body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  did uuid;
  mid uuid;
  eval public.ghc_quarterly_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO eval FROM public.ghc_quarterly_evaluations WHERE id = _evaluation_id;
  IF eval.id IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF eval.employee_id <> me AND eval.manager_id <> me AND NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.ghc_evaluation_discussions (evaluation_id)
  VALUES (_evaluation_id)
  ON CONFLICT (evaluation_id) DO UPDATE SET evaluation_id = EXCLUDED.evaluation_id
  RETURNING id INTO did;

  SELECT id INTO did FROM public.ghc_evaluation_discussions WHERE evaluation_id = _evaluation_id;

  INSERT INTO public.ghc_evaluation_discussion_messages (discussion_id, author_employee_id, body)
  VALUES (did, me, trim(_body))
  RETURNING id INTO mid;

  RETURN mid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_get_my_notifications(_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
    FROM (
      SELECT id, event_type, period, title, body, href, read_at, created_at,
             (read_at IS NULL) AS is_unread
      FROM public.ghc_notifications
      WHERE recipient_employee_id = me
      ORDER BY created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(_limit, 30), 100))
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_mark_notification_read(_notification_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ghc_notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = _notification_id AND recipient_employee_id = public.ghc_me();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ghc_get_my_tasks(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_upsert_monthly_review(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_upsert_360(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_my_360_aggregate(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_upsert_quarterly_evaluation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_acknowledge_evaluation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_upsert_partner_recommendation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_release_period(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_directory_status(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_admin_completion_summary(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_evaluation_discussion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_post_evaluation_discussion_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_create_notification(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_get_my_notifications(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_mark_notification_read(uuid) TO authenticated;
