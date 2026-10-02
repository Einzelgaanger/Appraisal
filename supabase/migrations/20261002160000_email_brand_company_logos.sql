-- Point branded mail at the company lockups instead of the favicons.

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
      'logo', 'https://ghc.vgg.tools/email/ghc-mark.png',
      'alt', 'GreenHouse Capital',
      'logo_width', '44',
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
      'logo', 'https://vigipay.vgg.tools/email/vigipay-logo.png',
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
      'logo', 'https://executive.vgg.tools/email/vgg-logo.webp',
      'alt', 'Venture Garden Group',
      'logo_width', '176',
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
