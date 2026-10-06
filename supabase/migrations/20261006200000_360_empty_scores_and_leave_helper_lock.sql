-- Follow-up to 20261006180000_feedback_leave_checkin_360:
-- a quarter with no submitted peers shows an empty 360, not five blank bars;
-- leave mail and HR lookup stay inside the leave functions.

CREATE OR REPLACE FUNCTION public.ghc_get_my_360_aggregate(_period_quarter text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.ghc_me();
  peer_count integer := 0;
  result jsonb;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('released', true, 'peerCount', 0, 'scores', '[]'::jsonb, 'themes', '[]'::jsonb);
  END IF;

  SELECT COUNT(*) INTO peer_count
  FROM public.ghc_360_responses
  WHERE reviewee_id = me AND period = _period_quarter AND status = 'submitted';

  IF peer_count = 0 THEN
    RETURN jsonb_build_object('released', true, 'peerCount', 0, 'scores', '[]'::jsonb, 'themes', '[]'::jsonb);
  END IF;

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

REVOKE ALL ON FUNCTION public.ghc_payload_bool(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_company_hr_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_notify_leave(uuid, text, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
