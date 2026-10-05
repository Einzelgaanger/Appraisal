-- Alfred Mulinge reports to Baluku so his performance is tracked
-- with the rest of Central Ops. He stays hierarchy 2. His role stays Technology.

UPDATE public.employees report
SET
  manager_id = baluku.id,
  secondary_manager_id = NULL,
  department = 'Central Ops - Executive office',
  department_code = 'central_ops',
  hierarchy_level = 2,
  eo_appraisal_active = true,
  appraisal_receives_comments = true,
  appraisal_self_performance = false,
  appraisal_gives_comments = false
FROM public.employees baluku
WHERE baluku.subsidiary_id = '11111111-1111-1111-1111-111111111111'
  AND lower(baluku.email) = lower('baluku.dounnah@venturegardengroup.com')
  AND report.subsidiary_id = baluku.subsidiary_id
  AND lower(report.email) = lower('alfred.mulinge@venturegardengroup.com');

UPDATE public.profiles p
SET
  department = e.department,
  hierarchy_level = e.hierarchy_level
FROM public.employees e
WHERE e.id = p.employee_id
  AND lower(e.email) = lower('alfred.mulinge@venturegardengroup.com');

INSERT INTO public.eo_ea_quarterly_pairs (reviewer_employee_id, reviewee_employee_id, review_mode)
SELECT baluku.id, report.id, 'standard'
FROM public.employees baluku
JOIN public.employees report
  ON report.subsidiary_id = baluku.subsidiary_id
 AND lower(report.email) = lower('alfred.mulinge@venturegardengroup.com')
WHERE baluku.subsidiary_id = '11111111-1111-1111-1111-111111111111'
  AND lower(baluku.email) = lower('baluku.dounnah@venturegardengroup.com')
ON CONFLICT (reviewer_employee_id, reviewee_employee_id)
DO UPDATE SET review_mode = 'standard';
