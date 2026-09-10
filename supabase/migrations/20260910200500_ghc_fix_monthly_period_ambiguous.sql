-- CRITICAL HOTFIX: ambiguous `period` variable breaks all GHC form submits.
-- Paste this in Supabase SQL Editor first if the full hardening migration is too large.

CREATE OR REPLACE FUNCTION public.ghc_upsert_monthly_review(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.ghc_me();
  rid uuid;
  report uuid := (_payload->>'report_id')::uuid;
  v_period text := _payload->>'period';
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
  ) VALUES (
    COALESCE((_payload->>'id')::uuid, gen_random_uuid()),
    COALESCE((_payload->>'manager_id')::uuid, me),
    report, v_period, st,
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
      '/hub?tenant=ghc&tab=survey', v_period
    );
  END IF;

  RETURN rid;
END;
$$;
