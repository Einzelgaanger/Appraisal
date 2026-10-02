-- Alfred Mulinge (VGG) on the Executive Office roster.
-- Appraisal stays off so this login can open the executive workspace
-- without joining the live BOOM peer-360 cycle.

INSERT INTO public.employees (
  subsidiary_id,
  name,
  email,
  role,
  department,
  hierarchy_level,
  eo_appraisal_active,
  ghc_appraisal_active,
  vigipay_appraisal_active,
  appraisal_self_performance,
  appraisal_gives_comments,
  appraisal_receives_comments,
  locked_tenant_slug,
  company_admin
)
SELECT
  '11111111-1111-1111-1111-111111111111',
  'Alfred Mulinge',
  'alfred.mulinge@venturegardengroup.com',
  'Technology',
  'Executive Office',
  2,
  false,
  false,
  false,
  false,
  false,
  false,
  'executiveteam',
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.employees
  WHERE lower(trim(email)) = lower('alfred.mulinge@venturegardengroup.com')
);
