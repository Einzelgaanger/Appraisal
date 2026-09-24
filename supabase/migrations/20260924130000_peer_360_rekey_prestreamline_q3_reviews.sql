-- The Q3 2026 360 instrument was streamlined mid-quarter (see 20260924120000).
-- Twelve reviews had already been submitted against the retired 49-question bank, which
-- would blend two instruments into one set of Q3 section averages. Re-key those reviews
-- (and the result discussions hanging off them) to 2026-Q3-legacy so the Q3 dashboard
-- reflects only the streamlined form. Nothing is deleted.
--
-- Empty Q3 drafts are left alone: they carry no answers, so they simply pick up the new form.

WITH moved AS (
  UPDATE public.assessment_responses r
  SET period = '2026-Q3-legacy'
  WHERE r.period = '2026-Q3'
    AND r.status = 'submitted'
    AND r.form_id = (SELECT id FROM public.assessment_forms WHERE code = 'peer_360')
    AND EXISTS (
      SELECT 1
      FROM public.assessment_answers a
      JOIN public.assessment_questions q ON q.id = a.question_id
      WHERE a.response_id = r.id AND NOT q.is_active
    )
  RETURNING r.reviewee_id
)
UPDATE public.boom_result_discussions d
SET period = '2026-Q3-legacy'
WHERE d.form_code = 'peer_360'
  AND d.period = '2026-Q3'
  AND d.subject_employee_id IN (SELECT reviewee_id FROM moved);
