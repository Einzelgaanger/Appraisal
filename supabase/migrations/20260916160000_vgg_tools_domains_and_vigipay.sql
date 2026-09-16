-- Production hosts on vgg.tools + VigiPay subsidiary placeholder
-- Safe to re-run: upserts tenants first, then domains.

INSERT INTO public.subsidiaries (id, name, hierarchy_lower_is_senior)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'VigiPay',
  false
)
ON CONFLICT (id) DO UPDATE
SET name = excluded.name;

INSERT INTO public.tenants (
  id,
  slug,
  name,
  appraisal_mode,
  enabled_modules,
  branding,
  capabilities
) VALUES
  (
    '11111111-1111-1111-1111-111111111110',
    'executiveteam',
    'VGG Executive Team',
    'boom',
    '["appraisal"]'::jsonb,
    '{"shortName":"Executive Team","fullName":"VGG Executive Team","workspaceLabel":"Executive Team BOOM workspace","subsidiaryId":"11111111-1111-1111-1111-111111111111"}'::jsonb,
    '{"showDemoRoute":false,"showRankings":false,"showGrowthHub":true,"showLegacyDashboard":false,"showLegacySurvey":false,"showAppraisalAdmin":true,"showEaQuarterlyResults":true,"showDirectoryInsights":true,"showComments":true}'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222220',
    'ghc',
    'GreenHouse Capital',
    'boom',
    '["appraisal"]'::jsonb,
    '{"shortName":"GHC","fullName":"GreenHouse Capital","workspaceLabel":"GreenHouse Capital workspace","subsidiaryId":"22222222-2222-2222-2222-222222222222"}'::jsonb,
    '{"showDemoRoute":false,"showRankings":false,"showGrowthHub":true,"showLegacyDashboard":false,"showLegacySurvey":false,"showAppraisalAdmin":true,"showEaQuarterlyResults":false,"showDirectoryInsights":true,"showComments":false}'::jsonb
  ),
  (
    '33333333-3333-3333-3333-333333333330',
    'vigipay',
    'VigiPay',
    'boom',
    '["appraisal"]'::jsonb,
    '{"shortName":"VigiPay","fullName":"VigiPay","workspaceLabel":"VigiPay appraisal workspace","subsidiaryId":"33333333-3333-3333-3333-333333333333"}'::jsonb,
    '{"showDemoRoute":false,"showRankings":false,"showGrowthHub":false,"showLegacyDashboard":false,"showLegacySurvey":false,"showAppraisalAdmin":false,"showEaQuarterlyResults":false,"showDirectoryInsights":false,"showComments":false}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = excluded.name,
  branding = excluded.branding,
  capabilities = excluded.capabilities,
  updated_at = now();

INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary)
VALUES
  ('11111111-1111-1111-1111-111111111110', 'executive.vgg.tools', true),
  ('11111111-1111-1111-1111-111111111110', 'executive.vgg.app', false),
  ('22222222-2222-2222-2222-222222222220', 'ghc.vgg.tools', true),
  ('22222222-2222-2222-2222-222222222220', 'ghc.vgg.app', false),
  ('33333333-3333-3333-3333-333333333330', 'vigipay.vgg.tools', true)
ON CONFLICT (hostname) DO UPDATE
SET tenant_id = excluded.tenant_id,
    is_primary = excluded.is_primary;

UPDATE public.tenant_domains
SET is_primary = false
WHERE hostname IN ('executiveteam.vgg.app', 'appraisal.vgg.app', 'ghc.vgg.app', 'executive.vgg.app');

UPDATE public.tenant_domains
SET is_primary = true
WHERE hostname IN ('executive.vgg.tools', 'ghc.vgg.tools', 'vigipay.vgg.tools');

INSERT INTO public.tenant_modules (tenant_id, module_key, enabled, settings)
VALUES
  ('11111111-1111-1111-1111-111111111110', 'appraisal', true, '{"defaultRoute":"/hub?tab=survey"}'::jsonb),
  ('22222222-2222-2222-2222-222222222220', 'appraisal', true, '{"defaultRoute":"/hub?tab=survey"}'::jsonb),
  ('33333333-3333-3333-3333-333333333330', 'appraisal', true, '{"defaultRoute":"/hub?tab=survey","status":"coming_soon"}'::jsonb)
ON CONFLICT (tenant_id, module_key) DO UPDATE
SET enabled = excluded.enabled,
    settings = excluded.settings;
