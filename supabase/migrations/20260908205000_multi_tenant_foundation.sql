create table if not exists public.tenants (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  appraisal_mode text not null check (appraisal_mode in ('boom', 'legacy')),
  enabled_modules jsonb not null default '[]'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  hostname text not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, module_key)
);

create table if not exists public.tenant_appraisal_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  team_member_min_level integer not null default 2,
  hierarchy_lower_is_senior boolean not null default false,
  release_policy jsonb not null default '{}'::jsonb,
  anonymity_policy jsonb not null default '{}'::jsonb,
  routing_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_role_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_key text not null,
  label text not null,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, role_key)
);

create table if not exists public.tenant_hierarchy_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  level_index integer not null,
  label text not null,
  role_group text null,
  created_at timestamptz not null default now(),
  unique (tenant_id, level_index)
);

create table if not exists public.tenant_form_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  title text not null,
  forms jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.tenant_routing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_key text not null,
  description text not null,
  rule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, rule_key)
);

insert into public.tenants (
  id,
  slug,
  name,
  appraisal_mode,
  enabled_modules,
  branding,
  capabilities
) values
  (
    '11111111-1111-1111-1111-111111111110',
    'executiveteam',
    'VGG Executive Team',
    'boom',
    '["appraisal"]'::jsonb,
    '{"shortName":"Executive Team","fullName":"VGG Executive Team","workspaceLabel":"Executive Team BOOM workspace"}'::jsonb,
    '{"showDemoRoute":false,"showRankings":false,"showGrowthHub":true,"showLegacyDashboard":false,"showLegacySurvey":false,"showAppraisalAdmin":true,"showEaQuarterlyResults":true,"showDirectoryInsights":true,"showComments":true}'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222220',
    'ghc',
    'GreenHouse Capital',
    'boom',
    '["appraisal"]'::jsonb,
    '{"shortName":"GHC","fullName":"GreenHouse Capital","workspaceLabel":"GHC appraisal workspace"}'::jsonb,
    '{"showDemoRoute":false,"showRankings":false,"showGrowthHub":true,"showLegacyDashboard":false,"showLegacySurvey":false,"showAppraisalAdmin":true,"showEaQuarterlyResults":true,"showDirectoryInsights":true,"showComments":true}'::jsonb
  )
on conflict (slug) do update
set
  name = excluded.name,
  appraisal_mode = excluded.appraisal_mode,
  enabled_modules = excluded.enabled_modules,
  branding = excluded.branding,
  capabilities = excluded.capabilities,
  updated_at = now();

insert into public.tenant_domains (tenant_id, hostname, is_primary) values
  ('11111111-1111-1111-1111-111111111110', 'executiveteam.vgg.app', true),
  ('11111111-1111-1111-1111-111111111110', 'appraisal.vgg.app', false),
  ('22222222-2222-2222-2222-222222222220', 'ghc.vgg.app', true)
on conflict (hostname) do update
set tenant_id = excluded.tenant_id,
    is_primary = excluded.is_primary;

insert into public.tenant_modules (tenant_id, module_key, enabled, settings) values
  ('11111111-1111-1111-1111-111111111110', 'appraisal', true, '{"defaultRoute":"/hub?tab=survey"}'::jsonb),
  ('22222222-2222-2222-2222-222222222220', 'appraisal', true, '{"defaultRoute":"/hub?tab=survey"}'::jsonb)
on conflict (tenant_id, module_key) do update
set enabled = excluded.enabled,
    settings = excluded.settings;

insert into public.tenant_appraisal_configs (
  tenant_id,
  team_member_min_level,
  hierarchy_lower_is_senior,
  release_policy,
  anonymity_policy,
  routing_policy
) values
  (
    '11111111-1111-1111-1111-111111111110',
    2,
    true,
    '{"minimumPeerResponses":3,"releaseGate":"manager-controlled"}'::jsonb,
    '{"peerFeedbackThreshold":3}'::jsonb,
    '{"selfForms":["executive","monthly_self"],"reviewForms":["peer_360","ea_quarterly","epa_gceo_assessor"]}'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222220',
    2,
    true,
    '{"minimumPeerResponses":3,"releaseGate":"manager-controlled"}'::jsonb,
    '{"peerFeedbackThreshold":3}'::jsonb,
    '{"selfForms":["executive","monthly_self"],"reviewForms":["peer_360","ea_quarterly","epa_gceo_assessor"]}'::jsonb
  )
on conflict (tenant_id) do update
set
  team_member_min_level = excluded.team_member_min_level,
  hierarchy_lower_is_senior = excluded.hierarchy_lower_is_senior,
  release_policy = excluded.release_policy,
  anonymity_policy = excluded.anonymity_policy,
  routing_policy = excluded.routing_policy,
  updated_at = now();

insert into public.tenant_form_sets (tenant_id, code, title, forms) values
  ('11111111-1111-1111-1111-111111111110', 'core-appraisal', 'Executive Team core appraisal', '["executive","monthly_self","peer_360","ea_quarterly","epa_gceo_assessor"]'::jsonb),
  ('22222222-2222-2222-2222-222222222220', 'core-appraisal', 'GHC core appraisal', '["executive","monthly_self","peer_360","ea_quarterly","epa_gceo_assessor"]'::jsonb)
on conflict (tenant_id, code) do update
set title = excluded.title,
    forms = excluded.forms;

insert into public.tenant_hierarchy_levels (tenant_id, level_index, label, role_group) values
  ('11111111-1111-1111-1111-111111111110', 0, 'L0', 'executive'),
  ('11111111-1111-1111-1111-111111111110', 1, 'L1', 'lead'),
  ('11111111-1111-1111-1111-111111111110', 2, 'L2', 'team_member'),
  ('22222222-2222-2222-2222-222222222220', 0, 'L0', 'executive'),
  ('22222222-2222-2222-2222-222222222220', 1, 'L1', 'lead'),
  ('22222222-2222-2222-2222-222222222220', 2, 'L2', 'team_member')
on conflict (tenant_id, level_index) do update
set label = excluded.label,
    role_group = excluded.role_group;

insert into public.tenant_role_definitions (tenant_id, role_key, label, capabilities) values
  ('11111111-1111-1111-1111-111111111110', 'participant', 'Participant', '{"selfAssessment":true,"peerReviews":true}'::jsonb),
  ('11111111-1111-1111-1111-111111111110', 'manager', 'Manager', '{"teamPulse":true,"comments":true,"directory":true}'::jsonb),
  ('11111111-1111-1111-1111-111111111110', 'people_ops', 'People Ops', '{"releaseGate":true,"reporting":true}'::jsonb),
  ('22222222-2222-2222-2222-222222222220', 'participant', 'Participant', '{"selfAssessment":true,"peerReviews":true}'::jsonb),
  ('22222222-2222-2222-2222-222222222220', 'manager', 'Manager', '{"teamPulse":true,"comments":true,"directory":true}'::jsonb),
  ('22222222-2222-2222-2222-222222222220', 'people_ops', 'People Ops', '{"releaseGate":true,"reporting":true}'::jsonb)
on conflict (tenant_id, role_key) do update
set label = excluded.label,
    capabilities = excluded.capabilities;

insert into public.tenant_routing_rules (tenant_id, rule_key, description, rule) values
  (
    '11111111-1111-1111-1111-111111111110',
    'peer-review-routing',
    'Assign peer 360 and leadership forms using hierarchy and capability flags.',
    '{"usesHierarchyLevels":true,"usesCommentFlags":true}'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222220',
    'peer-review-routing',
    'Assign peer 360 and leadership forms using hierarchy and capability flags.',
    '{"usesHierarchyLevels":true,"usesCommentFlags":true}'::jsonb
  )
on conflict (tenant_id, rule_key) do update
set description = excluded.description,
    rule = excluded.rule;
