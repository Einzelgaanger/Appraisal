-- Q3 2026 streamlined 360° instrument (executive team review).
-- 49 scored items -> 17 core scored + 4 manager/executive-only; 5 open prompts -> 3.
-- NON-DESTRUCTIVE: prior questions are archived (is_active = false) so Q1/Q2 2026
-- answers, dashboards, and released results stay readable.

ALTER TABLE public.assessment_questions
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.assessment_questions.is_active IS
  'False for retired question-bank versions — kept so historical answers remain readable but never served in a new response.';

CREATE INDEX IF NOT EXISTS assessment_questions_active_idx
  ON public.assessment_questions(form_id, is_active, section_order, sort_order);

-- ---------- retire the May 2026 peer_360 bank ----------
UPDATE public.assessment_questions q
SET is_active = false
FROM public.assessment_forms f
WHERE q.form_id = f.id AND f.code = 'peer_360' AND q.is_active;

UPDATE public.assessment_forms
SET
  title = 'Quarterly 360° Peer Review',
  description = 'Anonymous behaviourally anchored peer review (Q3 2026 streamlined instrument): 17 core behaviours, 4 additional for managers/executive leaders, 3 open prompts. Use N/O when you have not observed the behaviour.'
WHERE code = 'peer_360';

WITH f AS (SELECT id FROM public.assessment_forms WHERE code = 'peer_360')
INSERT INTO public.assessment_questions (form_id, section, section_order, sort_order, question_text, question_type, min_words, helper_text, audience)
SELECT f.id, s.section, s.so, s.qo, s.q, s.qt, s.mw, s.h, s.aud
FROM f, (VALUES
  ('Cultural Agility & Humility', 1, 1, 'Admits mistakes openly and actively seeks feedback from peers and colleagues, visibly using both as a basis for improvement rather than concealing, deflecting, or ignoring input.', 'scored', NULL::int, NULL::text, 'all'),
  ('Cultural Agility & Humility', 1, 2, 'Demonstrates emotional maturity by staying composed and respectful during conflict, tension, or a difficult instruction.', 'scored', NULL::int, NULL::text, 'all'),
  ('Collaboration & Partnership', 2, 1, 'Treats people with respect regardless of seniority or role, and collaborates across verticals with a “One Executive Office” mindset rather than focusing solely on their own vertical''s interests.', 'scored', NULL::int, NULL::text, 'all'),
  ('Collaboration & Partnership', 2, 2, 'Addresses conflicts or misalignments constructively and early rather than letting them compound.', 'scored', NULL::int, NULL::text, 'all'),
  ('Adaptability', 3, 1, 'Stays resilient and pivots without panic under pressure, and anticipates problems before they escalate rather than reacting after the fact.', 'scored', NULL::int, NULL::text, 'all'),
  ('Innovation', 4, 1, 'Challenges convention and proposes better ways of doing things, backed by preparation rather than instinct or ego.', 'scored', NULL::int, NULL::text, 'all'),
  ('BOOM Philosophy in Practice', 5, 1, 'Demonstrates execution-first behaviour — moves from direction to action quickly and takes full ownership of outcomes end to end rather than completing their part and stepping back.', 'scored', NULL::int, NULL::text, 'all'),
  ('BOOM Philosophy in Practice', 5, 2, 'Builds things rather than just completing tasks — work creates something reusable, systematic, or compounding.', 'scored', NULL::int, NULL::text, 'all'),
  ('Communication & Responsiveness', 6, 1, 'Communicates clearly and consistently, sharing essential information early enough for colleagues to act on it.', 'scored', NULL::int, NULL::text, 'all'),
  ('Communication & Responsiveness', 6, 2, 'Responds promptly to messages, escalations, and requests — avoids delays that affect the workflow of others.', 'scored', NULL::int, NULL::text, 'all'),
  ('Executive Office Standards', 7, 1, 'Handles sensitive information with strict confidentiality — no leaks, no casual sharing.', 'scored', NULL::int, NULL::text, 'all'),
  ('Executive Office Standards', 7, 2, 'Anticipates what is needed before being asked, and produces work that is complete and accurate the first time with minimal repeated correction or clarification.', 'scored', NULL::int, NULL::text, 'all'),
  ('Executive Office Standards', 7, 3, 'Documents work and decisions so others can access, understand, and build on them — not held only in their head.', 'scored', NULL::int, NULL::text, 'all'),
  ('Governance, Integrity & Discretion', 8, 1, 'Upholds ethical conduct — no shortcuts or personal interest over the team.', 'scored', NULL::int, NULL::text, 'all'),
  ('Governance, Integrity & Discretion', 8, 2, 'Models accountability — owns decisions, mistakes, and outcomes without deflection.', 'scored', NULL::int, NULL::text, 'all'),
  ('Development & Team Contribution', 9, 1, 'Actively supports colleagues when they are stretched — without being asked.', 'scored', NULL::int, NULL::text, 'all'),
  ('Development & Team Contribution', 9, 2, 'Raises the standard around them — their presence makes the team better.', 'scored', NULL::int, NULL::text, 'all'),
  ('Development — Managers / Executive leaders', 10, 1, 'Actively develops capability in their vertical — identifies gaps, creates learning opportunities, builds people.', 'scored', NULL::int, 'Shown only to managers and executive leaders (hierarchy level ≤ 2).', 'manager_only'),
  ('Development — Managers / Executive leaders', 10, 2, 'Delegates meaningfully — gives real ownership and accountability rather than hoarding critical work.', 'scored', NULL::int, NULL::text, 'manager_only'),
  ('Development — Managers / Executive leaders', 10, 3, 'Provides structured, honest feedback regularly — not only in formal review moments.', 'scored', NULL::int, NULL::text, 'manager_only'),
  ('Development — Managers / Executive leaders', 10, 4, 'Reduces dependency on themselves — systems and documentation survive their absence.', 'scored', NULL::int, NULL::text, 'manager_only'),
  ('Open Feedback', 11, 1, 'What is one specific behaviour or area this person should improve? What would better look like?', 'written', NULL::int, 'Be specific. Generic answers are not useful.', 'all'),
  ('Open Feedback', 11, 2, 'What is one behaviour this person should START or STOP doing to increase their effectiveness?', 'written', NULL::int, NULL::text, 'all'),
  ('Open Feedback', 11, 3, 'What is one thing this person should CONTINUE doing because it creates meaningful value for the team or Executive Office?', 'written', NULL::int, NULL::text, 'all')
) AS s(section, so, qo, q, qt, mw, h, aud)
WHERE EXISTS (SELECT 1 FROM f);

-- ---------- narrative bucketing ----------
-- The streamlined prompt 2 names both START and STOP, so keyword matching would file the
-- same answer under two themes. Bucket the current bank by position and keep keyword
-- matching for the archived bank, where each prompt named exactly one verb.
CREATE OR REPLACE FUNCTION public.boom_360_feedback_bucket(
  _is_active boolean,
  _section text,
  _sort_order int,
  _question_type text,
  _question_text text
)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _question_type = 'scored' THEN NULL
    WHEN _is_active AND _section = 'Open Feedback' THEN
      CASE _sort_order WHEN 1 THEN 'stop' WHEN 2 THEN 'start' WHEN 3 THEN 'continue' ELSE NULL END
    WHEN lower(_question_text) LIKE '%stop%' THEN 'stop'
    WHEN lower(_question_text) LIKE '%start%' THEN 'start'
    WHEN lower(_question_text) LIKE '%continue%' THEN 'continue'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.boom_360_feedback_bucket(boolean, text, int, text, text) IS
  'Maps a 360 written prompt to the stop | start | continue theme column. Scored items (whose text answers are optional rating context) are never bucketed.';

CREATE OR REPLACE FUNCTION public.get_my_360_dashboard(_period text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid;
  peer_cnt int;
  min_peers int := 1;
  sections jsonb;
  narratives jsonb;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT COUNT(*)::int INTO peer_cnt
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE r.reviewee_id = me
    AND r.period = _period
    AND r.status = 'submitted'
    AND f.code = 'peer_360';

  IF peer_cnt < min_peers THEN
    RETURN jsonb_build_object(
      'released', true,
      'peer_count', peer_cnt,
      'min_peers_required', min_peers,
      'sections', '[]'::jsonb,
      'start_doing', '[]'::jsonb,
      'stop_doing', '[]'::jsonb,
      'continue_doing', '[]'::jsonb,
      'themes', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'section', section,
    'avg_score', avg_score,
    'response_count', response_count
  ) ORDER BY section_order), '[]'::jsonb)
  INTO sections
  FROM (
    SELECT
      q.section,
      MIN(q.section_order) AS section_order,
      ROUND(AVG(a.score)::numeric, 2) AS avg_score,
      COUNT(a.score)::int AS response_count
    FROM public.assessment_answers a
    JOIN public.assessment_questions q ON q.id = a.question_id
    JOIN public.assessment_responses r ON r.id = a.response_id
    JOIN public.assessment_forms f ON f.id = r.form_id
    WHERE r.reviewee_id = me
      AND r.period = _period
      AND r.status = 'submitted'
      AND f.code = 'peer_360'
      AND a.score IS NOT NULL
      AND NOT a.no_opportunity
    GROUP BY q.section
  ) section_agg;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('text', trim(a.text_answer)) ORDER BY r.submitted_at NULLS LAST), '[]'::jsonb)
  INTO narratives
  FROM public.assessment_answers a
  JOIN public.assessment_questions q ON q.id = a.question_id
  JOIN public.assessment_responses r ON r.id = a.response_id
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE r.reviewee_id = me
    AND r.period = _period
    AND r.status = 'submitted'
    AND f.code = 'peer_360'
    AND public.boom_meaningful_text_answer(a.text_answer);

  RETURN jsonb_build_object(
    'released', true,
    'peer_count', peer_cnt,
    'min_peers_required', min_peers,
    'sections', COALESCE(sections, '[]'::jsonb),
    'start_doing', (
      SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
               row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
        FROM public.assessment_answers a
        JOIN public.assessment_questions q ON q.id = a.question_id
        JOIN public.assessment_responses r ON r.id = a.response_id
        JOIN public.assessment_forms f ON f.id = r.form_id
        WHERE r.reviewee_id = me
          AND r.period = _period
          AND r.status = 'submitted'
          AND f.code = 'peer_360'
          AND public.boom_meaningful_text_answer(a.text_answer)
          AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'start'
      ) s
    ),
    'stop_doing', (
      SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
               row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
        FROM public.assessment_answers a
        JOIN public.assessment_questions q ON q.id = a.question_id
        JOIN public.assessment_responses r ON r.id = a.response_id
        JOIN public.assessment_forms f ON f.id = r.form_id
        WHERE r.reviewee_id = me
          AND r.period = _period
          AND r.status = 'submitted'
          AND f.code = 'peer_360'
          AND public.boom_meaningful_text_answer(a.text_answer)
          AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'stop'
      ) s
    ),
    'continue_doing', (
      SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
               row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
        FROM public.assessment_answers a
        JOIN public.assessment_questions q ON q.id = a.question_id
        JOIN public.assessment_responses r ON r.id = a.response_id
        JOIN public.assessment_forms f ON f.id = r.form_id
        WHERE r.reviewee_id = me
          AND r.period = _period
          AND r.status = 'submitted'
          AND f.code = 'peer_360'
          AND public.boom_meaningful_text_answer(a.text_answer)
          AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'continue'
      ) s
    ),
    'themes', COALESCE(narratives, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_eo_growth_hub_pulse(_period text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid;
  my_level int;
  peer_cnt int;
  subject_cnt int;
  team_peer_cnt int;
  sections jsonb;
  start_doing jsonb;
  stop_doing jsonb;
  continue_doing jsonb;
  themes jsonb;
  pulse_label text;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT hierarchy_level INTO my_level FROM public.employees WHERE id = me;

  SELECT COUNT(*)::int INTO peer_cnt
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE r.reviewee_id = me AND r.period = _period AND r.status = 'submitted' AND f.code = 'peer_360';

  IF peer_cnt >= 1 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'section', section, 'avg_score', avg_score, 'response_count', response_count
    ) ORDER BY section_order), '[]'::jsonb) INTO sections
    FROM (
      SELECT q.section, MIN(q.section_order) AS section_order,
             ROUND(AVG(a.score)::numeric, 2) AS avg_score, COUNT(a.score)::int AS response_count
      FROM public.assessment_answers a
      JOIN public.assessment_questions q ON q.id = a.question_id
      JOIN public.assessment_responses r ON r.id = a.response_id
      JOIN public.assessment_forms f ON f.id = r.form_id
      WHERE r.reviewee_id = me AND r.period = _period AND r.status = 'submitted'
        AND f.code = 'peer_360' AND a.score IS NOT NULL AND NOT a.no_opportunity
      GROUP BY q.section
    ) section_agg;

    IF jsonb_array_length(COALESCE(sections, '[]'::jsonb)) > 0 THEN
      SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO start_doing FROM (
        SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
               row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
        FROM public.assessment_answers a
        JOIN public.assessment_questions q ON q.id = a.question_id
        JOIN public.assessment_responses r ON r.id = a.response_id
        JOIN public.assessment_forms f ON f.id = r.form_id
        WHERE r.reviewee_id = me AND r.period = _period AND r.status = 'submitted'
          AND f.code = 'peer_360' AND public.boom_meaningful_text_answer(a.text_answer)
          AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'start'
        LIMIT 15
      ) s;

      SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO stop_doing FROM (
        SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
               row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
        FROM public.assessment_answers a
        JOIN public.assessment_questions q ON q.id = a.question_id
        JOIN public.assessment_responses r ON r.id = a.response_id
        JOIN public.assessment_forms f ON f.id = r.form_id
        WHERE r.reviewee_id = me AND r.period = _period AND r.status = 'submitted'
          AND f.code = 'peer_360' AND public.boom_meaningful_text_answer(a.text_answer)
          AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'stop'
        LIMIT 15
      ) s;

      SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO continue_doing FROM (
        SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
               row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
        FROM public.assessment_answers a
        JOIN public.assessment_questions q ON q.id = a.question_id
        JOIN public.assessment_responses r ON r.id = a.response_id
        JOIN public.assessment_forms f ON f.id = r.form_id
        WHERE r.reviewee_id = me AND r.period = _period AND r.status = 'submitted'
          AND f.code = 'peer_360' AND public.boom_meaningful_text_answer(a.text_answer)
          AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'continue'
        LIMIT 15
      ) s;

      SELECT COALESCE(jsonb_agg(jsonb_build_object('text', trim(a.text_answer)) ORDER BY r.submitted_at NULLS LAST), '[]'::jsonb)
      INTO themes
      FROM public.assessment_answers a
      JOIN public.assessment_questions q ON q.id = a.question_id
      JOIN public.assessment_responses r ON r.id = a.response_id
      JOIN public.assessment_forms f ON f.id = r.form_id
      WHERE r.reviewee_id = me AND r.period = _period AND r.status = 'submitted'
        AND f.code = 'peer_360' AND public.boom_meaningful_text_answer(a.text_answer)
      LIMIT 20;

      RETURN jsonb_build_object(
        'mode', 'self', 'pulse_label', 'Your peer 360 feedback',
        'peer_count', peer_cnt, 'subject_count', 1,
        'sections', COALESCE(sections, '[]'::jsonb),
        'start_doing', COALESCE(start_doing, '[]'::jsonb),
        'stop_doing', COALESCE(stop_doing, '[]'::jsonb),
        'continue_doing', COALESCE(continue_doing, '[]'::jsonb),
        'themes', COALESCE(themes, '[]'::jsonb)
      );
    END IF;
  END IF;

  IF NOT public.boom_has_peer360_oversight_access(me) THEN RETURN '{}'::jsonb; END IF;

  SELECT COUNT(DISTINCT e.id)::int INTO subject_cnt
  FROM public.employees e
  WHERE e.subsidiary_id = '11111111-1111-1111-1111-111111111111'
    AND COALESCE(e.eo_appraisal_active, false)
    AND public.boom_peer360_oversight_subject_allowed(me, e.id);

  SELECT COUNT(DISTINCT r.id)::int INTO team_peer_cnt
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'peer_360'
  WHERE r.period = _period AND r.status = 'submitted'
    AND public.boom_peer360_oversight_subject_allowed(me, r.reviewee_id);

  IF subject_cnt = 0 OR team_peer_cnt = 0 THEN RETURN '{}'::jsonb; END IF;

  pulse_label := CASE WHEN COALESCE(my_level, 99) = 0 THEN 'Executive Office L2 team pulse'
    ELSE 'Your pod — L2 team pulse' END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'section', section, 'avg_score', avg_score, 'response_count', response_count
  ) ORDER BY section_order), '[]'::jsonb) INTO sections
  FROM (
    SELECT q.section, MIN(q.section_order) AS section_order,
           ROUND(AVG(a.score)::numeric, 2) AS avg_score, COUNT(a.score)::int AS response_count
    FROM public.assessment_answers a
    JOIN public.assessment_questions q ON q.id = a.question_id
    JOIN public.assessment_responses r ON r.id = a.response_id
    JOIN public.assessment_forms f ON f.id = r.form_id
    WHERE r.period = _period AND r.status = 'submitted' AND f.code = 'peer_360'
      AND a.score IS NOT NULL AND NOT a.no_opportunity
      AND public.boom_peer360_oversight_subject_allowed(me, r.reviewee_id)
    GROUP BY q.section
  ) section_agg;

  IF jsonb_array_length(COALESCE(sections, '[]'::jsonb)) = 0 THEN RETURN '{}'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO start_doing FROM (
    SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
           row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
    FROM public.assessment_answers a
    JOIN public.assessment_questions q ON q.id = a.question_id
    JOIN public.assessment_responses r ON r.id = a.response_id
    JOIN public.assessment_forms f ON f.id = r.form_id
    WHERE r.period = _period AND r.status = 'submitted' AND f.code = 'peer_360'
      AND public.boom_meaningful_text_answer(a.text_answer)
      AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'start'
      AND public.boom_peer360_oversight_subject_allowed(me, r.reviewee_id)
    LIMIT 15
  ) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO stop_doing FROM (
    SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
           row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
    FROM public.assessment_answers a
    JOIN public.assessment_questions q ON q.id = a.question_id
    JOIN public.assessment_responses r ON r.id = a.response_id
    JOIN public.assessment_forms f ON f.id = r.form_id
    WHERE r.period = _period AND r.status = 'submitted' AND f.code = 'peer_360'
      AND public.boom_meaningful_text_answer(a.text_answer)
      AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'stop'
      AND public.boom_peer360_oversight_subject_allowed(me, r.reviewee_id)
    LIMIT 15
  ) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO continue_doing FROM (
    SELECT jsonb_build_object('text', trim(a.text_answer), 'direction', 'peer') AS x,
           row_number() OVER (ORDER BY r.submitted_at NULLS LAST) AS ord
    FROM public.assessment_answers a
    JOIN public.assessment_questions q ON q.id = a.question_id
    JOIN public.assessment_responses r ON r.id = a.response_id
    JOIN public.assessment_forms f ON f.id = r.form_id
    WHERE r.period = _period AND r.status = 'submitted' AND f.code = 'peer_360'
      AND public.boom_meaningful_text_answer(a.text_answer)
      AND public.boom_360_feedback_bucket(q.is_active, q.section, q.sort_order, q.question_type, q.question_text) = 'continue'
      AND public.boom_peer360_oversight_subject_allowed(me, r.reviewee_id)
    LIMIT 15
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('text', trim(a.text_answer)) ORDER BY r.submitted_at NULLS LAST), '[]'::jsonb)
  INTO themes
  FROM public.assessment_answers a
  JOIN public.assessment_questions q ON q.id = a.question_id
  JOIN public.assessment_responses r ON r.id = a.response_id
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE r.period = _period AND r.status = 'submitted' AND f.code = 'peer_360'
    AND public.boom_meaningful_text_answer(a.text_answer)
    AND public.boom_peer360_oversight_subject_allowed(me, r.reviewee_id)
  LIMIT 20;

  RETURN jsonb_build_object(
    'mode', 'team_pulse', 'pulse_label', pulse_label,
    'peer_count', team_peer_cnt, 'subject_count', subject_cnt,
    'sections', COALESCE(sections, '[]'::jsonb),
    'start_doing', COALESCE(start_doing, '[]'::jsonb),
    'stop_doing', COALESCE(stop_doing, '[]'::jsonb),
    'continue_doing', COALESCE(continue_doing, '[]'::jsonb),
    'themes', COALESCE(themes, '[]'::jsonb)
  );
END;
$$;
