-- Leave notices were stored in the app and flagged as emailed, but never handed to the mail queue.
-- HR gets the request by email and in the leave planner. After HR clears it, the line manager
-- gets the same pair of notices. Approval and decline mail the person who asked.

CREATE OR REPLACE FUNCTION public.workspace_notify_leave(
  _recipient uuid,
  _title text,
  _body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  brand jsonb;
  slug text;
  origin text;
  href text;
  html text;
  recip text;
  nid uuid;
  safe_body text;
BEGIN
  IF _recipient IS NULL THEN
    RETURN;
  END IF;

  brand := COALESCE(
    public.email_brand_for_employee(_recipient),
    public.email_brand_for_slug('executiveteam')
  );
  slug := coalesce(brand->>'slug', 'executiveteam');
  origin := coalesce(brand->>'site_url', 'https://executive.vgg.tools');
  href := '/hub?tab=leave&tenant=' || slug;

  BEGIN
    INSERT INTO public.ghc_notifications (recipient_employee_id, event_type, period, title, body, href)
    VALUES (_recipient, 'leave_update', to_char(CURRENT_DATE, 'YYYY-MM'), _title, _body, href);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leave in-app notice failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.boom_notifications (
      recipient_employee_id, event_type, form_code, period, title, body, href, email_queued
    ) VALUES (
      _recipient,
      'leave_update',
      'leave',
      to_char(CURRENT_DATE, 'YYYY-MM'),
      _title,
      _body,
      href,
      false
    )
    RETURNING id INTO nid;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leave bell failed: %', SQLERRM;
    nid := NULL;
  END;

  BEGIN
    recip := public.boom_employee_login_email(_recipient);
    IF recip IS NULL OR recip = '' THEN
      RETURN;
    END IF;

    safe_body := replace(replace(replace(coalesce(_body, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    html := public.boom_branded_email_html(
      brand->>'site_name',
      _title,
      '<p style="margin:0 0 12px;line-height:1.55;">' || safe_body || '</p>',
      'Open leave planner',
      origin || href,
      brand->>'footer_note'
    );
    PERFORM public.boom_queue_transactional_email(
      _recipient,
      _title || ' · ' || coalesce(brand->>'site_name', 'VGG'),
      html,
      'leave_update',
      jsonb_build_object(
        'event_type', 'leave_update',
        'href', href,
        'tenant', slug,
        'notification_id', nid
      )
    );
    IF nid IS NOT NULL THEN
      UPDATE public.boom_notifications SET email_queued = true WHERE id = nid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'leave email failed for %: %', _recipient, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_notify_leave(uuid, text, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
