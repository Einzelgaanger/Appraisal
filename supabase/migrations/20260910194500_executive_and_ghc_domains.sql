-- Point Executive Team primary hostname at executive.vgg.app (keep appraisal as alias).

insert into public.tenant_domains (tenant_id, hostname, is_primary) values
  ('11111111-1111-1111-1111-111111111110', 'executive.vgg.app', true),
  ('11111111-1111-1111-1111-111111111110', 'appraisal.vgg.app', false),
  ('11111111-1111-1111-1111-111111111110', 'executiveteam.vgg.app', false),
  ('22222222-2222-2222-2222-222222222220', 'ghc.vgg.app', true)
on conflict (hostname) do update
set tenant_id = excluded.tenant_id,
    is_primary = excluded.is_primary;

-- Only one primary per tenant: demote older EO primaries if executive is present
update public.tenant_domains
set is_primary = false
where tenant_id = '11111111-1111-1111-1111-111111111110'
  and hostname <> 'executive.vgg.app';

update public.tenant_domains
set is_primary = true
where hostname = 'executive.vgg.app';
