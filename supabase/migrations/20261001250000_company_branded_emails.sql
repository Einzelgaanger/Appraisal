-- Company-locked routing helpers + per-company branded emails.
--
-- Auth emails used to say "VGG 360° Appraisal" for everyone. Transactional HTML
-- used the VGG logo even when the CTA pointed at GHC / VigiPay. Lookup is by
-- roster row (locked_tenant_slug, then subsidiary → tenants.slug), never email domain.

CREATE OR REPLACE FUNCTION public.email_brand_for_slug(_slug text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(nullif(trim(_slug), ''), 'executiveteam'))
    WHEN 'ghc' THEN jsonb_build_object(
      'slug', 'ghc',
      'site_name', 'GreenHouse Capital',
      'from_header', 'GreenHouse Capital <noreply@vgg.tools>',
      'site_url', 'https://ghc.vgg.tools',
      'logo', 'https://ghc.vgg.tools/ghc-favicon.png',
      'alt', 'GreenHouse Capital',
      'logo_width', '48',
      'accent', '#003333',
      'button_fg', '#f7fbfb',
      'page_bg', '#f3f6f6',
      'border', '#c5d4d4',
      'heading', '#0a1f1f',
      'body', '#3d4f4f',
      'muted', '#6a7a7a',
      'copyright', 'GreenHouse Capital. A Venture Garden Group company.',
      'footer_note', 'You received this because you are on the GreenHouse Capital roster.'
    )
    WHEN 'vigipay' THEN jsonb_build_object(
      'slug', 'vigipay',
      'site_name', 'VigiPay',
      'from_header', 'VigiPay <noreply@vgg.tools>',
      'site_url', 'https://vigipay.vgg.tools',
      'logo', 'https://vigipay.vgg.tools/vigipay-favicon.png',
      'alt', 'VigiPay',
      'logo_width', '48',
      'accent', '#003A48',
      'button_fg', '#f7fbfc',
      'page_bg', '#f2f6f7',
      'border', '#c5d4d8',
      'heading', '#062028',
      'body', '#3a5258',
      'muted', '#6a7f84',
      'copyright', 'VigiPay. A Venture Garden Group company.',
      'footer_note', 'You received this because you are on the VigiPay roster.'
    )
    ELSE jsonb_build_object(
      'slug', 'executiveteam',
      'site_name', 'VGG Executive Team',
      'from_header', 'VGG Executive Team <noreply@vgg.tools>',
      'site_url', 'https://executive.vgg.tools',
      'logo', 'https://executive.vgg.tools/favicon.png',
      'alt', 'Venture Garden Group',
      'logo_width', '40',
      'accent', '#2e6f20',
      'button_fg', '#fbf8f1',
      'page_bg', '#f7f3eb',
      'border', '#cfd8d2',
      'heading', '#10211a',
      'body', '#4a5f55',
      'muted', '#6f7f77',
      'copyright', 'Venture Garden Group.',
      'footer_note', 'You received this because you are on the VGG Executive Team roster.'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_slug_for_email(_email text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(nullif(trim(e.locked_tenant_slug), ''), t.slug)
  FROM public.employees e
  LEFT JOIN public.tenants t ON t.subsidiary_id = e.subsidiary_id
  WHERE e.email IS NOT NULL
    AND trim(e.email) <> ''
    AND lower(trim(e.email)) = lower(trim(_email))
  ORDER BY
    CASE WHEN nullif(trim(e.locked_tenant_slug), '') IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN t.slug IS NOT NULL THEN 0 ELSE 1 END,
    e.created_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.email_brand_for_employee(_employee_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.email_brand_for_slug(
    COALESCE(
      nullif(trim(e.locked_tenant_slug), ''),
      t.slug,
      'executiveteam'
    )
  )
  FROM public.employees e
  LEFT JOIN public.tenants t ON t.subsidiary_id = e.subsidiary_id
  WHERE e.id = _employee_id;
$$;

CREATE OR REPLACE FUNCTION public.email_slug_from_hint(_hint text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(_hint, '')) ~ 'vigipay' THEN 'vigipay'
    WHEN lower(coalesce(_hint, '')) ~ '(ghc|greenhouse)' THEN 'ghc'
    ELSE 'executiveteam'
  END;
$$;

CREATE OR REPLACE FUNCTION public.boom_branded_email_html(
  _eyebrow text,
  _heading text,
  _body_html text,
  _cta_label text,
  _cta_url text,
  _footer_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  brand jsonb;
  year text := to_char(CURRENT_DATE, 'YYYY');
  footer text;
  cta text;
BEGIN
  brand := public.email_brand_for_slug(
    public.email_slug_from_hint(coalesce(_cta_url, '') || ' ' || coalesce(_eyebrow, ''))
  );
  cta := COALESCE(nullif(trim(_cta_url), ''), brand->>'site_url');
  footer := COALESCE(
    nullif(trim(_footer_note), ''),
    brand->>'footer_note',
    'If you were not expecting this message, you may safely ignore it.'
  );

  RETURN format(
$sql$<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:%s;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color:%s;">
    <tr>
      <td align="center" style="padding:28px 16px 40px;">
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
          <tr>
            <td style="padding:0 0 18px;border-bottom:1px solid %s;">
              <img src="%s" alt="%s" width="%s" style="display:block;border:0;outline:none;margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-radius:4px;padding:34px 28px;border:1px solid %s;border-top:6px solid %s;">
              <p style="font-size:10px;font-weight:700;color:%s;margin:0 0 12px;text-transform:uppercase;letter-spacing:2px;">%s</p>
              <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:500;color:%s;margin:0 0 18px;line-height:1.15;letter-spacing:0;">%s</h1>
              <div style="font-size:15px;color:%s;line-height:1.7;margin:0 0 26px;">%s</div>
              <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:4px 0 28px;">
                    <a href="%s" style="background-color:%s;color:%s;font-size:13px;font-weight:700;border-radius:4px;padding:14px 28px;text-decoration:none;display:inline-block;text-transform:uppercase;letter-spacing:1.4px;">%s</a>
                  </td>
                </tr>
              </table>
              <p style="font-size:10px;color:%s;text-align:center;margin:0 0 8px;letter-spacing:1.6px;text-transform:uppercase;">— or copy this link into your browser —</p>
              <p style="font-size:11px;color:%s;word-break:break-all;margin:0;text-align:center;">%s</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 0;">
              <hr style="border:none;border-top:1px solid %s;margin:0 0 14px;" />
              <p style="font-size:12px;color:%s;text-align:left;margin:0 0 8px;line-height:1.5;">%s</p>
              <p style="font-size:11px;color:%s;text-align:left;margin:0;text-transform:uppercase;letter-spacing:1.2px;">© %s %s All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$sql$,
    brand->>'page_bg',
    brand->>'page_bg',
    brand->>'border',
    brand->>'logo',
    brand->>'alt',
    brand->>'logo_width',
    brand->>'border',
    brand->>'accent',
    brand->>'accent',
    COALESCE(_eyebrow, brand->>'site_name'),
    brand->>'heading',
    COALESCE(_heading, 'Update'),
    brand->>'body',
    COALESCE(_body_html, ''),
    cta,
    brand->>'accent',
    brand->>'button_fg',
    COALESCE(_cta_label, 'Open workspace'),
    brand->>'muted',
    brand->>'accent',
    cta,
    brand->>'border',
    brand->>'muted',
    footer,
    brand->>'muted',
    year,
    brand->>'copyright'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.boom_queue_transactional_email(
  _to_employee uuid,
  _subject_line text,
  _html_body text,
  _template text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recip text;
  mid text;
  brand jsonb;
BEGIN
  recip := public.boom_employee_login_email(_to_employee);
  IF recip IS NULL OR recip = '' THEN
    RETURN;
  END IF;

  brand := COALESCE(
    public.email_brand_for_employee(_to_employee),
    public.email_brand_for_slug('executiveteam')
  );

  mid := 'boom-' || _template || '-' || replace(gen_random_uuid()::text, '-', '');

  PERFORM public.enqueue_email(
    'transactional_emails',
    jsonb_build_object(
      'to', recip,
      'from', brand->>'from_header',
      'sender_domain', 'notify.vgg.tools',
      'subject', _subject_line,
      'html', _html_body,
      'label', _template,
      'template_name', _template,
      'message_id', mid,
      'queued_at', to_jsonb(now()),
      'metadata', _metadata
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'boom_queue_transactional_email failed for %: %', _to_employee, SQLERRM;
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  nid uuid;
  href text;
  html text;
  brand jsonb;
  origin text;
  slug text;
BEGIN
  brand := COALESCE(
    public.email_brand_for_employee(_employee_id),
    public.email_brand_for_slug('ghc')
  );
  slug := coalesce(brand->>'slug', 'ghc');
  origin := coalesce(brand->>'site_url', 'https://ghc.vgg.tools');

  href := COALESCE(nullif(trim(_href), ''), '/hub?tenant=' || slug || '&tab=survey');
  IF href NOT LIKE '%tenant=%' AND href LIKE '/hub%' THEN
    IF href LIKE '%?%' THEN
      href := href || '&tenant=' || slug;
    ELSE
      href := href || '?tenant=' || slug;
    END IF;
  END IF;

  INSERT INTO public.ghc_notifications (recipient_employee_id, event_type, period, title, body, href)
  VALUES (_employee_id, _event_type, _period, _title, _body, href)
  RETURNING id INTO nid;

  BEGIN
    html := public.boom_branded_email_html(
      brand->>'site_name',
      _title,
      '<p style="margin:0 0 12px;line-height:1.55;color:#334155">' || replace(replace(_body, '<', '&lt;'), '>', '&gt;') || '</p>',
      'Open workspace',
      origin || href,
      brand->>'footer_note'
    );
    PERFORM public.boom_queue_transactional_email(
      _employee_id,
      _title || ' · ' || (brand->>'site_name'),
      html,
      'ghc_' || coalesce(_event_type, 'notice'),
      jsonb_build_object(
        'event_type', _event_type,
        'period', _period,
        'notification_id', nid,
        'href', href,
        'tenant', slug
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ghc email queue failed for %: %', _employee_id, SQLERRM;
  END;

  RETURN nid;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_slug_for_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.tenant_slug_for_email(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.email_brand_for_slug(text) FROM public;
GRANT EXECUTE ON FUNCTION public.email_brand_for_slug(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.email_brand_for_employee(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.email_brand_for_employee(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
