-- Old mailbox names still have to open the same account, and a past quarter's
-- score has to stay visible after the cycle moves on.
--
-- Udeme's roster address changed (udeme.inyang, ekemudeme.iriyang) and several
-- people still type a peopleos.co or swapped-name address. Sign-in resolves
-- those to the live login. My Dashboard can list every quarter that already
-- has a manager score, peer 360, or company evaluation.

CREATE TABLE IF NOT EXISTS public.employee_email_aliases (
  alias_email text PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE
);

ALTER TABLE public.employee_email_aliases ENABLE ROW LEVEL SECURITY;

INSERT INTO public.employee_email_aliases (alias_email, employee_id)
SELECT lower(v.alias_email), e.id
FROM (
  VALUES
    ('eniola.olawale@peopleos.co', 'eniola.olawale@venturegardengroup.com'),
    ('kunmi.demuren@peopleos.co', 'kunmi.demuren@venturegardengroup.com'),
    ('demola.idowu@peopleos.co', 'demola.idowu@venturegardengroup.com'),
    ('uche.ukonu@peopleos.co', 'uche.ukonu@venturegardengroup.com'),
    ('omotola.akinyemiju@peopleos.co', 'omotola.akinyemiju@venturegardengroup.com'),
    ('gisele.karekezi@peopleos.co', 'gisele.karakezi@venturegardengroup.com'),
    ('gisele.karakezi@peopleos.co', 'gisele.karakezi@venturegardengroup.com'),
    ('gisele.karekezi@venturegardengroup.com', 'gisele.karakezi@venturegardengroup.com'),
    ('deyi.dipeolu@peopleos.co', 'deyi.dipeolu@venturegardengroup.com'),
    ('tobi.bankole@peopleos.co', 'tobi.bankole@venturegardengroup.com'),
    ('dorathy.akor@peopleos.co', 'dorathy.akor@venturegardengroup.com'),
    ('ayomide.adeosun@peopleos.co', 'adeosun.ayomide@venturegardengroup.com'),
    ('adeosun.ayomide@peopleos.co', 'adeosun.ayomide@venturegardengroup.com'),
    ('ayomide.adeosun@venturegardengroup.com', 'adeosun.ayomide@venturegardengroup.com'),
    ('brenda.nafula@peopleos.co', 'brenda.nafula@vgplatform.com'),
    ('oluwatobi.ijamakinwa@peopleos.co', 'oluwatobiloba.ijamakinwa@venturegardengroup.com'),
    ('oluwatobiloba.ijamakinwa@peopleos.co', 'oluwatobiloba.ijamakinwa@venturegardengroup.com'),
    ('oluwatobi.ijamakinwa@venturegardengroup.com', 'oluwatobiloba.ijamakinwa@venturegardengroup.com'),
    ('gideon.abiona@peopleos.co', 'gideon.abiona@venturegardengroup.com'),
    ('abiona.gideon@peopleos.co', 'gideon.abiona@venturegardengroup.com'),
    ('abiona.gideon@venturegardengroup.com', 'gideon.abiona@venturegardengroup.com'),
    ('chukwuka.monyei@peopleos.co', 'chukwuka.monyei@venturegardengroup.com'),
    ('melissa.omede@peopleos.co', 'melissa.omede@venturegardengroup.com'),
    ('baluku.dounnah@peopleos.co', 'baluku.dounnah@venturegardengroup.com'),
    ('regina.ottoh-ebhonu@peopleos.co', 'regina.ottoh-ebhonu@venturegardengroup.com'),
    ('favour.oyekanmi@peopleos.co', 'favour.oyekanmi@venturegardengroup.com'),
    ('ekemudeme.iriyang@peopleos.co', 'ekemudeme.inyang@venturegardengroup.com'),
    ('ekemudeme.iriyang@venturegardengroup.com', 'ekemudeme.inyang@venturegardengroup.com'),
    ('udeme.inyang@peopleos.co', 'ekemudeme.inyang@venturegardengroup.com'),
    ('udeme.inyang@venturegardengroup.com', 'ekemudeme.inyang@venturegardengroup.com'),
    ('ekemudeme.inyang@peopleos.co', 'ekemudeme.inyang@venturegardengroup.com'),
    ('adeyinka.oshin@peopleos.co', 'adeyinka.oshin@venturegardengroup.com')
) AS v(alias_email, current_email)
JOIN public.employees e ON lower(e.email) = lower(v.current_email)
WHERE lower(v.alias_email) <> lower(v.current_email)
ON CONFLICT (alias_email) DO UPDATE SET employee_id = EXCLUDED.employee_id;

-- The address a person should type, or the live login when they used an old one.
CREATE OR REPLACE FUNCTION public.canonical_login_email(_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  raw text := lower(btrim(coalesce(_email, '')));
  local_part text;
  found text;
  matches int;
BEGIN
  IF raw = '' OR position('@' IN raw) = 0 THEN
    RETURN raw;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = raw) THEN
    RETURN raw;
  END IF;

  SELECT lower(e.email)
    INTO found
  FROM public.employee_email_aliases a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE lower(a.alias_email) = raw
    AND e.email IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(e.email))
  LIMIT 1;

  IF found IS NOT NULL THEN
    RETURN found;
  END IF;

  local_part := split_part(raw, '@', 1);

  SELECT count(DISTINCT lower(e.email))
    INTO matches
  FROM public.employees e
  WHERE lower(split_part(e.email, '@', 1)) = local_part
    AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(e.email));

  IF matches = 1 THEN
    SELECT lower(e.email)
      INTO found
    FROM public.employees e
    WHERE lower(split_part(e.email, '@', 1)) = local_part
      AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(e.email))
    LIMIT 1;
    RETURN found;
  END IF;

  SELECT count(DISTINCT lower(e.email))
    INTO matches
  FROM public.employees e
  WHERE public.employee_person_key(e.email) IS NOT NULL
    AND public.employee_person_key(e.email) = public.employee_person_key(raw)
    AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(e.email));

  IF matches = 1 THEN
    SELECT lower(e.email)
      INTO found
    FROM public.employees e
    WHERE public.employee_person_key(e.email) = public.employee_person_key(raw)
      AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(e.email))
    LIMIT 1;
    RETURN found;
  END IF;

  RETURN raw;
END;
$$;

REVOKE ALL ON FUNCTION public.canonical_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_login_email(text) TO anon, authenticated;

-- Re-read the password flag from the real hash. Clears a stuck lock once the
-- password is no longer a shared company password.
CREATE OR REPLACE FUNCTION public.refresh_password_change_requirement()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  still_shared boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT public.password_is_shared(u.encrypted_password)
    INTO still_shared
  FROM auth.users u
  WHERE u.id = auth.uid();

  PERFORM set_config('app.allow_password_flag', 'on', true);
  UPDATE public.profiles
  SET must_change_password = coalesce(still_shared, false)
  WHERE id = auth.uid();

  RETURN NOT coalesce(still_shared, false);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_password_change_requirement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_password_change_requirement() TO authenticated;

-- Every quarter this person already has a score for. No fallback into another quarter.
CREATE OR REPLACE FUNCTION public.get_my_quarter_score_history()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  me uuid;
BEGIN
  me := public.current_employee_id();
  IF me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.period)
    FROM (
      SELECT
        period,
        ea_avg,
        ea_pct,
        ea_submissions,
        peer_avg,
        peer_reviews,
        eval_pct
      FROM (
        SELECT
          p.period,
          ea.ea_avg,
          ea.ea_pct,
          coalesce(ea.ea_submissions, 0) AS ea_submissions,
          peer.peer_avg,
          coalesce(peer.peer_reviews, 0) AS peer_reviews,
          ev.eval_pct
        FROM (
          SELECT r.period
          FROM public.assessment_responses r
          JOIN public.assessment_forms f ON f.id = r.form_id
          WHERE r.reviewee_id = me
            AND r.status = 'submitted'
            AND f.code IN ('ea_quarterly', 'peer_360')
            AND r.period ~ '^[0-9]{4}-Q[1-4]$'
          UNION
          SELECT q.period
          FROM public.ghc_quarterly_evaluations q
          WHERE q.employee_id = me
            AND q.status IN ('submitted', 'acknowledged')
            AND q.period ~ '^[0-9]{4}-Q[1-4]$'
        ) p
        LEFT JOIN LATERAL (
          SELECT
            round(avg(a.score)::numeric, 2) AS ea_avg,
            round((avg(a.score)::numeric / 5) * 100, 0) AS ea_pct,
            count(DISTINCT r.id)::int AS ea_submissions
          FROM public.assessment_responses r
          JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'ea_quarterly'
          JOIN public.assessment_answers a ON a.response_id = r.id
          JOIN public.assessment_questions qq ON qq.id = a.question_id
          WHERE r.reviewee_id = me
            AND r.period = p.period
            AND r.status = 'submitted'
            AND a.score IS NOT NULL
            AND NOT a.no_opportunity
            AND qq.question_type = 'scored'
        ) ea ON true
        LEFT JOIN LATERAL (
          SELECT
            round(avg(a.score)::numeric, 2) AS peer_avg,
            count(DISTINCT r.id)::int AS peer_reviews
          FROM public.assessment_responses r
          JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'peer_360'
          JOIN public.assessment_answers a ON a.response_id = r.id
          WHERE r.reviewee_id = me
            AND r.period = p.period
            AND r.status = 'submitted'
            AND a.score IS NOT NULL
            AND NOT a.no_opportunity
        ) peer ON true
        LEFT JOIN LATERAL (
          SELECT round(avg(q.total_pct)::numeric, 0) AS eval_pct
          FROM public.ghc_quarterly_evaluations q
          WHERE q.employee_id = me
            AND q.period = p.period
            AND q.status IN ('submitted', 'acknowledged')
            AND q.total_pct IS NOT NULL
        ) ev ON true
      ) scored
      WHERE ea_submissions > 0 OR peer_reviews > 0 OR eval_pct IS NOT NULL
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_quarter_score_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_quarter_score_history() TO authenticated;

CREATE OR REPLACE FUNCTION public.find_account_candidates(_query text)
RETURNS TABLE (
  id uuid,
  name text,
  role text,
  email text,
  department text,
  company_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  q text := lower(btrim(coalesce(_query, '')));
BEGIN
  q := replace(replace(replace(q, '\', ''), '%', ''), '_', '');
  IF char_length(q) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.name, e.role, e.email, e.department, s.name
  FROM public.employees e
  LEFT JOIN public.subsidiaries s ON s.id = e.subsidiary_id
  WHERE lower(e.name) LIKE '%' || q || '%'
     OR lower(coalesce(e.email, '')) LIKE '%' || q || '%'
     OR EXISTS (
       SELECT 1
       FROM public.employee_email_aliases a
       WHERE a.employee_id = e.id
         AND lower(a.alias_email) LIKE '%' || q || '%'
     )
  ORDER BY e.name
  LIMIT 12;
END;
$$;
