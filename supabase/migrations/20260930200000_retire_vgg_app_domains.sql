-- Retire *.vgg.app — production is vgg.tools tenant hosts only.

DELETE FROM public.tenant_domains
WHERE hostname LIKE '%.vgg.app';

-- Branded emails + notification deep links (Executive Team + GHC).
CREATE OR REPLACE FUNCTION public.boom_branded_email_html(
  _eyebrow text,
  _heading text,
  _body_html text,
  _cta_label text,
  _cta_url text,
  _footer_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  logo text := 'https://vgg.tools/vgg-logo.webp';
  year text := to_char(CURRENT_DATE, 'YYYY');
  footer text;
BEGIN
  footer := COALESCE(
    _footer_note,
    'If you were not expecting this message, you may safely ignore it.'
  );

  RETURN format(
$sql$<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f7f3eb;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color:#f7f3eb;">
    <tr>
      <td align="center" style="padding:28px 16px 40px;">
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
          <tr>
            <td style="padding:0 0 18px;border-bottom:1px solid #cfd8d2;margin:0 0 16px;">
              <img src="%s" alt="Venture Garden Group" width="140" style="display:block;border:0;outline:none;margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-radius:4px;padding:34px 28px;border:1px solid #cfd8d2;border-top:6px solid #2e6f20;">
              <p style="font-size:10px;font-weight:700;color:#2e6f20;margin:0 0 12px;text-transform:uppercase;letter-spacing:2px;">%s</p>
              <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:500;color:#10211a;margin:0 0 18px;line-height:1.15;letter-spacing:0;">%s</h1>
              <div style="font-size:15px;color:#4a5f55;line-height:1.7;margin:0 0 26px;">%s</div>
              <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:4px 0 28px;">
                    <a href="%s" style="background-color:#2e6f20;color:#fbf8f1;font-size:13px;font-weight:700;border-radius:4px;padding:14px 28px;text-decoration:none;display:inline-block;text-transform:uppercase;letter-spacing:1.4px;">%s</a>
                  </td>
                </tr>
              </table>
              <p style="font-size:10px;color:#6f7f77;text-align:center;margin:0 0 8px;letter-spacing:1.6px;text-transform:uppercase;">— or copy this link into your browser —</p>
              <p style="font-size:11px;color:#2e6f20;word-break:break-all;margin:0;text-align:center;">%s</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 0;">
              <hr style="border:none;border-top:1px solid #cfd8d2;margin:0 0 14px;" />
              <p style="font-size:12px;color:#6f7f77;text-align:left;margin:0 0 8px;line-height:1.5;">%s</p>
              <p style="font-size:11px;color:#8c9993;text-align:left;margin:0;text-transform:uppercase;letter-spacing:1.2px;">© %s Venture Garden Group. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$sql$,
    logo,
    COALESCE(_eyebrow, 'VGG 360° Appraisal'),
    COALESCE(_heading, 'Update'),
    COALESCE(_body_html, ''),
    COALESCE(_cta_url, 'https://executive.vgg.tools/hub'),
    COALESCE(_cta_label, 'Open appraisal'),
    COALESCE(_cta_url, 'https://executive.vgg.tools/hub'),
    footer,
    year
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ghc_create_notification(
  _employee_id uuid,
  _event_type text,
  _title text,
  _body text,
  _href text DEFAULT '/hub?tenant=ghc&tab=survey',
  _period text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nid uuid;
  href text;
  html text;
BEGIN
  href := COALESCE(nullif(trim(_href), ''), '/hub?tenant=ghc&tab=survey');
  IF href NOT LIKE '%tenant=%' AND href LIKE '/hub%' THEN
    IF href LIKE '%?%' THEN
      href := href || '&tenant=ghc';
    ELSE
      href := href || '?tenant=ghc';
    END IF;
  END IF;

  INSERT INTO public.ghc_notifications (recipient_employee_id, event_type, period, title, body, href)
  VALUES (_employee_id, _event_type, _period, _title, _body, href)
  RETURNING id INTO nid;

  BEGIN
    html := public.boom_branded_email_html(
      'GreenHouse Capital appraisal',
      _title,
      '<p style="margin:0 0 12px;line-height:1.55;color:#334155">' || replace(replace(_body, '<', '&lt;'), '>', '&gt;') || '</p>',
      'Open workspace',
      'https://ghc.vgg.tools' || href,
      'You received this because you are on the GreenHouse Capital appraisal roster.'
    );
    PERFORM public.boom_queue_transactional_email(
      _employee_id,
      _title || ' · GreenHouse Capital',
      html,
      'ghc_' || coalesce(_event_type, 'notice'),
      jsonb_build_object(
        'event_type', _event_type,
        'period', _period,
        'notification_id', nid,
        'href', href
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ghc email queue failed for %: %', _employee_id, SQLERRM;
  END;

  RETURN nid;
END;
$$;

-- Patch hub URL defaults in submit + discussion notification functions (body unchanged except host).
DO $patch$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'boom_notify_assessment_submitted';

  IF def IS NOT NULL THEN
    def := replace(def, 'https://appraisal.vgg.app/', 'https://executive.vgg.tools/');
    EXECUTE def;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'boom_notify_discussion_created';

  IF def IS NOT NULL THEN
    def := replace(def, 'https://appraisal.vgg.app/', 'https://executive.vgg.tools/');
    EXECUTE def;
  END IF;
END;
$patch$;
