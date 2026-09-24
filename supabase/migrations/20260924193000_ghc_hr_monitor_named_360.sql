-- GHC People Ops / HR can use Monitor + release + named 360 view.
-- Fixes: "identity kept for HR only" with no HR UI, and no way to open the period.

-- 1) Treat company_admin as pool admin for GHC (same as VigiPay already does)
CREATE OR REPLACE FUNCTION public.ghc_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = public.ghc_me()
        AND coalesce(e.company_admin, false)
        AND public.ghc_member_pool(e.id) IN ('ghc', 'vigipay')
    ) THEN true
    ELSE public.has_role(auth.uid(), 'admin'::public.app_role)
  END;
$$;

-- 2) Seed People Ops (and Uloma as lead) as company admins for GHC
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

-- 3) HR-only: named peer 360 responses (reviewer identity visible)
CREATE OR REPLACE FUNCTION public.ghc_admin_list_360_named(_period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pool text;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin / People Ops only';
  END IF;

  pool := coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc');

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.reviewee_name, t.reviewer_name)
    FROM (
      SELECT
        r.id,
        r.period,
        r.status,
        r.submitted_at,
        r.reviewer_id,
        rev.name AS reviewer_name,
        rev.email AS reviewer_email,
        r.reviewee_id,
        ree.name AS reviewee_name,
        ree.email AS reviewee_email,
        r.score_founders_lps,
        r.example_founders_lps,
        r.score_curious,
        r.example_curious,
        r.score_move_fast,
        r.example_move_fast,
        r.score_overachievement,
        r.example_overachievement,
        r.score_job_done,
        r.example_job_done,
        r.did_well,
        r.additional_comments
      FROM public.ghc_360_responses r
      JOIN public.employees rev ON rev.id = r.reviewer_id
      JOIN public.employees ree ON ree.id = r.reviewee_id
      WHERE r.period = _period_quarter
        AND r.status = 'submitted'
        AND public.ghc_member_pool(r.reviewee_id) = pool
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_admin_cycle_status(_period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pool text;
  sub uuid;
  peer_released timestamptz;
  eval_released timestamptz;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin / People Ops only';
  END IF;

  pool := coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc');
  sub := public.ghc_pool_subsidiary(pool);

  SELECT c.released_at INTO peer_released
  FROM public.ghc_cycle_settings c
  WHERE c.subsidiary_id = sub AND c.kind = 'peer_360' AND c.period = _period_quarter
  LIMIT 1;

  SELECT c.released_at INTO eval_released
  FROM public.ghc_cycle_settings c
  WHERE c.subsidiary_id = sub AND c.kind = 'quarterly_evaluation' AND c.period = _period_quarter
  LIMIT 1;

  RETURN jsonb_build_object(
    'period', _period_quarter,
    'peer_360_released_at', peer_released,
    'quarterly_evaluation_released_at', eval_released
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ghc_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_admin_list_360_named(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_admin_cycle_status(text) TO authenticated;
