-- The admin monitor RPCs were never pool-scoped when VigiPay was added, so a VigiPay
-- company admin saw the GreenHouse Capital roster count and GHC's submitted quarterly
-- evaluations (names + scores). Scope both to the caller's own pool.

CREATE OR REPLACE FUNCTION public.ghc_admin_completion_summary(_period_quarter text, _period_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pool text;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  pool := coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc');

  RETURN jsonb_build_object(
    'roster', (
      SELECT count(*) FROM public.employees e
      WHERE public.ghc_member_pool(e.id) = pool
    ),
    'monthlySubmitted', (
      SELECT count(*) FROM public.ghc_monthly_reviews r
      WHERE r.period = _period_month
        AND r.status = 'submitted'
        AND public.ghc_member_pool(r.report_id) = pool
    ),
    'peer360Submitted', (
      SELECT count(*) FROM public.ghc_360_responses r
      WHERE r.period = _period_quarter
        AND r.status = 'submitted'
        AND public.ghc_member_pool(r.reviewee_id) = pool
    ),
    'evaluationsSubmitted', (
      SELECT count(*) FROM public.ghc_quarterly_evaluations q
      WHERE q.period = _period_quarter
        AND q.status IN ('submitted', 'acknowledged')
        AND public.ghc_member_pool(q.employee_id) = pool
    ),
    'evaluationsAcknowledged', (
      SELECT count(*) FROM public.ghc_quarterly_evaluations q
      WHERE q.period = _period_quarter
        AND q.status = 'acknowledged'
        AND public.ghc_member_pool(q.employee_id) = pool
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_admin_list_evaluations(_period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pool text;
BEGIN
  IF NOT public.ghc_is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  pool := coalesce(public.ghc_member_pool(public.ghc_me()), 'ghc');

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.submitted_at DESC NULLS LAST)
    FROM (
      SELECT
        q.id,
        q.period,
        q.status,
        q.total_score,
        q.total_pct,
        q.band_rating,
        q.submitted_at,
        emp.name AS employee_name,
        mgr.name AS manager_name
      FROM public.ghc_quarterly_evaluations q
      JOIN public.employees emp ON emp.id = q.employee_id
      JOIN public.employees mgr ON mgr.id = q.manager_id
      WHERE q.period = _period_quarter
        AND q.status IN ('submitted', 'acknowledged')
        AND public.ghc_member_pool(q.employee_id) = pool
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ghc_admin_completion_summary(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ghc_admin_list_evaluations(text) TO authenticated;
