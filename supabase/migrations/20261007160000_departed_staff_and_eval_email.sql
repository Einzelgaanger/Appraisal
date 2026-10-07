-- Gisele Karekezi and Oreoluwa Ifia have left. Take them off the Executive Office
-- appraisal platform. Brenda, Gideon, and Oluwatobiloba already have Omotola as
-- their other quarterly reviewer, so their reporting line moves to her.
-- Quarterly evaluations also email the person who was evaluated. The mail was
-- being queued and never sent because messages expired after 60 minutes.

UPDATE public.email_send_state
SET transactional_email_ttl_minutes = 20160
WHERE id = 1;

CREATE OR REPLACE FUNCTION public.boom_executive_self_allowed(_employee uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    lower(e.email) = ANY (ARRAY[
      lower('uche.ukonu@venturegardengroup.com'),
      lower('omotola.akinyemiju@venturegardengroup.com'),
      lower('deyi.dipeolu@venturegardengroup.com')
    ]),
    false
  )
  FROM public.employees e
  WHERE e.id = _employee
    AND COALESCE(e.eo_appraisal_active, false);
$$;

CREATE OR REPLACE FUNCTION public.boom_bunmi_ea_quarterly_l1(_reviewee uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    lower(e.email) = ANY (ARRAY[
      lower('uche.ukonu@venturegardengroup.com'),
      lower('omotola.akinyemiju@venturegardengroup.com')
    ]),
    false
  )
  FROM public.employees e
  WHERE e.id = _reviewee
    AND COALESCE(e.eo_appraisal_active, false);
$$;

DO $$
DECLARE
  eo uuid := '11111111-1111-1111-1111-111111111111';
  gisele uuid;
  oreo uuid;
  omotola uuid;
  departed uuid[];
BEGIN
  SELECT id INTO gisele
  FROM public.employees
  WHERE subsidiary_id = eo
    AND lower(email) = lower('gisele.karakezi@venturegardengroup.com')
  LIMIT 1;

  SELECT id INTO oreo
  FROM public.employees
  WHERE subsidiary_id = eo
    AND lower(email) = lower('oreoluwa.ifia@peopleos.co')
  LIMIT 1;

  SELECT id INTO omotola
  FROM public.employees
  WHERE subsidiary_id = eo
    AND lower(email) = lower('omotola.akinyemiju@venturegardengroup.com')
  LIMIT 1;

  departed := ARRAY[gisele, oreo];

  UPDATE public.employees
  SET
    eo_appraisal_active = false,
    appraisal_self_performance = false,
    appraisal_receives_comments = false
  WHERE id = ANY (departed);

  IF gisele IS NOT NULL AND omotola IS NOT NULL THEN
    UPDATE public.employees
    SET manager_id = omotola
    WHERE manager_id = gisele;
  END IF;

  UPDATE public.employees
  SET secondary_manager_id = NULL
  WHERE secondary_manager_id = ANY (departed);

  DELETE FROM public.eo_ea_quarterly_pairs
  WHERE reviewer_employee_id = ANY (departed)
     OR reviewee_employee_id = ANY (departed);

  UPDATE auth.users u
  SET banned_until = 'infinity'
  WHERE lower(u.email) IN (
      lower('gisele.karakezi@venturegardengroup.com'),
      lower('gisele.karekezi@peopleos.co'),
      lower('gisele.karakezi@peopleos.co'),
      lower('gisele.karekezi@venturegardengroup.com'),
      lower('oreoluwa.ifia@peopleos.co')
    )
    OR u.id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.employee_id = ANY (departed)
         OR p.active_employee_id = ANY (departed)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.boom_notify_assessment_submitted(_response_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  reviewee_name text;
  reviewer_name text;
  first_name text;
  brand jsonb;
  origin text;
  hub_discuss text;
  hub_360 text;
  title text;
  body text;
  email_subj text;
  email_html text;
  body_inner text;
  fac uuid;
  bunmi uuid;
  omotola uuid;
BEGIN
  SELECT
    ar.id,
    ar.reviewer_id,
    ar.reviewee_id,
    ar.period,
    ar.status,
    f.code AS form_code
  INTO r
  FROM public.assessment_responses ar
  JOIN public.assessment_forms f ON f.id = ar.form_id
  WHERE ar.id = _response_id;

  IF r.id IS NULL OR r.status <> 'submitted' THEN
    RETURN;
  END IF;

  SELECT name INTO reviewee_name FROM public.employees WHERE id = r.reviewee_id;
  SELECT name INTO reviewer_name FROM public.employees WHERE id = r.reviewer_id;
  first_name := COALESCE(NULLIF(split_part(COALESCE(reviewee_name, ''), ' ', 1), ''), 'there');
  brand := COALESCE(
    public.email_brand_for_employee(r.reviewee_id),
    public.email_brand_for_slug('executiveteam')
  );
  origin := coalesce(brand->>'site_url', 'https://executive.vgg.tools');
  hub_discuss := origin || '/hub?tab=survey&boomTab=discussions&tenant=executiveteam';
  hub_360 := origin || '/hub?tab=dashboard&tenant=executiveteam';
  bunmi := public.eo_employee_id_by_email('bunmi.akinyemiju@peopleos.co');
  omotola := public.eo_employee_id_by_email('omotola.akinyemiju@venturegardengroup.com');

  IF r.form_code = 'peer_360' AND r.reviewer_id <> r.reviewee_id THEN
    title := 'New anonymous 360 feedback';
    body := format(
      'A colleague submitted 360 peer feedback about you for %s. Your dashboard updates with anonymous aggregates only — reviewers are never named.',
      r.period
    );
    email_subj := format('VGG 360° Appraisal · New anonymous 360 feedback (%s)', r.period);
    body_inner := format(
      '<p style="margin:0 0 14px;">Hi %s,</p>
       <p style="margin:0 0 14px;">A colleague has submitted <strong>360 peer feedback</strong> about you for <strong>%s</strong>.</p>
       <p style="margin:0;">Your My Dashboard and 360 results update with <strong>anonymous aggregated scores and themes only</strong>. Individual reviewers are never shown.</p>',
      first_name, r.period
    );
    email_html := public.boom_branded_email_html(
      'VGG 360° Appraisal / Peer 360',
      'New anonymous 360 feedback',
      body_inner,
      'View my dashboard',
      hub_360,
      'Peer reviewers stay anonymous. This message does not identify who submitted.'
    );
    PERFORM public.boom_create_notification(
      r.reviewee_id, 'peer_360_received', r.form_code, r.period,
      title, body, '/hub?tab=dashboard',
      r.id, NULL,
      true, email_subj, email_html, 'boom_peer360_received'
    );
    RETURN;
  END IF;

  IF r.form_code = 'ea_quarterly' AND r.reviewer_id <> r.reviewee_id THEN
    title := 'Your quarterly evaluation is ready';
    body := format(
      '%s completed your Executive Office Quarterly Evaluation for %s. Open My Dashboard to view it.',
      COALESCE(reviewer_name, 'Your manager'), r.period
    );
    email_subj := format('Your quarterly evaluation is ready (%s)', r.period);
    body_inner := format(
      '<p style="margin:0 0 14px;">Hi %s,</p>
       <p style="margin:0 0 14px;"><strong>%s</strong> has completed your <strong>Executive Office Quarterly Evaluation</strong> for <strong>%s</strong>.</p>
       <p style="margin:0;">This email comes straight to you. Open My Dashboard to view the appraisal.</p>',
      first_name, COALESCE(reviewer_name, 'Your manager'), r.period
    );
    email_html := public.boom_branded_email_html(
      coalesce(brand->>'site_name', 'Executive Team BOOM'),
      'Your quarterly evaluation is ready',
      body_inner,
      'View my appraisal',
      hub_360,
      'You are receiving this because an evaluation about you was submitted.'
    );
    PERFORM public.boom_create_notification(
      r.reviewee_id, 'ea_quarterly_received', r.form_code, r.period,
      title, body, '/hub?tab=dashboard&tenant=executiveteam',
      r.id, r.reviewer_id,
      true, email_subj, email_html, 'boom_ea_quarterly_received'
    );
    RETURN;
  END IF;

  IF r.form_code = 'monthly_self' AND r.reviewer_id = r.reviewee_id THEN
    title := format('%s submitted monthly self-assessment', COALESCE(reviewee_name, 'A colleague'));
    body := format('Monthly self-assessment for %s is ready to discuss.', r.period);
    FOR fac IN
      SELECT DISTINCT x FROM unnest(ARRAY[
        (SELECT manager_id FROM public.employees WHERE id = r.reviewee_id),
        bunmi,
        omotola
      ]) AS t(x)
      WHERE x IS NOT NULL AND x <> r.reviewee_id
    LOOP
      IF (SELECT hierarchy_level FROM public.employees WHERE id = r.reviewee_id) = 1 AND fac <> bunmi THEN
        CONTINUE;
      END IF;
      PERFORM public.boom_create_notification(
        fac, 'monthly_self_submitted', r.form_code, r.period,
        title, body, '/hub?tab=survey&boomTab=discussions',
        r.id, r.reviewee_id,
        false, NULL, NULL, NULL
      );
    END LOOP;
    RETURN;
  END IF;

  IF r.form_code = 'executive' AND r.reviewer_id = r.reviewee_id THEN
    IF bunmi IS NOT NULL AND bunmi <> r.reviewee_id THEN
      title := format('%s submitted executive self-assessment', COALESCE(reviewee_name, 'A colleague'));
      body := format('Executive performance self-assessment for %s is ready.', r.period);
      PERFORM public.boom_create_notification(
        bunmi, 'executive_submitted', r.form_code, r.period,
        title, body, '/hub?tab=survey&boomTab=discussions',
        r.id, r.reviewee_id,
        false, NULL, NULL, NULL
      );
    END IF;
    RETURN;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
