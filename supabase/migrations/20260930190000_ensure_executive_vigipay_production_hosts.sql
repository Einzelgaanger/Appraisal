-- Ensure Executive Team + VigiPay production hostnames are registered for tenant routing metadata.
-- Safe to re-run (upsert on hostname).

INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary)
VALUES
  ('11111111-1111-1111-1111-111111111110', 'executive.vgg.tools', true),
  ('33333333-3333-3333-3333-333333333330', 'vigipay.vgg.tools', true)
ON CONFLICT (hostname) DO UPDATE
SET tenant_id = excluded.tenant_id,
    is_primary = excluded.is_primary;

UPDATE public.tenant_domains
SET is_primary = true
WHERE hostname IN ('executive.vgg.tools', 'vigipay.vgg.tools');
