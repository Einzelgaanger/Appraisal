-- GHC activation fix: run in Supabase SQL Editor after the main GHC migration.
-- Activates GHC for Bunmi + roster, and verifies task visibility.

-- 1) See who is flagged for GHC
SELECT id, name, email, ghc_appraisal_active, ghc_hierarchy_level, ghc_manager_id
FROM public.employees
WHERE lower(coalesce(email, '')) LIKE '%greenhouse.capital%'
   OR lower(coalesce(email, '')) IN (
        'bunmi.akinyemiju@venturegardengroup.com',
        'fiyinfoluwa.sanwo@venturegardengroup.com',
        'omotola.akinyemiju@greenhouse.capital',
        'omotola.akinyemiju@venturegardengroup.com'
      )
   OR name ILIKE '%bunmi%'
   OR name ILIKE '%uloma%'
   OR name ILIKE '%busayo%'
   OR name ILIKE '%mariam%'
   OR name ILIKE '%phebean%'
   OR name ILIKE '%faith%'
   OR name ILIKE '%anjola%'
ORDER BY name;

-- 2) Force-activate known GHC people by email / name (safe upsert of flags)
UPDATE public.employees e
SET
  ghc_appraisal_active = true,
  ghc_hierarchy_level = COALESCE(e.ghc_hierarchy_level, e.hierarchy_level, 1)
WHERE
  lower(coalesce(e.email, '')) IN (
    'bunmi.akinyemiju@venturegardengroup.com',
    'uloma.herrington@greenhouse.capital',
    'busayo.eniola-giwa@greenhouse.capital',
    'omotola.akinyemiju@greenhouse.capital',
    'phebean.falaye@greenhouse.capital',
    'fiyinfoluwa.sanwo@venturegardengroup.com',
    'mariam.adahunse@greenhouse.capital',
    'faith.aminaho@greenhouse.capital',
    'anjolaoluwa.jawando@greenhouse.capital'
  )
  OR e.name ILIKE 'Bunmi Akinyemiju%'
  OR e.name ILIKE 'Uloma Herrington%'
  OR e.name ILIKE 'Busayo%'
  OR e.name ILIKE 'Omotola Akinyemiju%'
  OR e.name ILIKE 'Phebean%'
  OR e.name ILIKE 'Fiyinfoluwa%'
  OR e.name ILIKE 'Mariam%'
  OR e.name ILIKE 'Faith Aminaho%'
  OR e.name ILIKE 'Anjolaoluwa%';

-- 3) Wire GHC reporting lines (by email match)
WITH ids AS (
  SELECT
    (SELECT id FROM employees WHERE lower(email) = 'bunmi.akinyemiju@venturegardengroup.com' OR name ILIKE 'Bunmi Akinyemiju%' LIMIT 1) AS bunmi,
    (SELECT id FROM employees WHERE lower(email) = 'uloma.herrington@greenhouse.capital' OR name ILIKE 'Uloma%' LIMIT 1) AS uloma,
    (SELECT id FROM employees WHERE lower(email) = 'busayo.eniola-giwa@greenhouse.capital' OR name ILIKE 'Busayo%' LIMIT 1) AS busayo,
    (SELECT id FROM employees WHERE lower(email) = 'omotola.akinyemiju@greenhouse.capital' OR name ILIKE 'Omotola Akinyemiju%' LIMIT 1) AS omotola,
    (SELECT id FROM employees WHERE lower(email) = 'phebean.falaye@greenhouse.capital' OR name ILIKE 'Phebean%' LIMIT 1) AS phebean,
    (SELECT id FROM employees WHERE lower(email) = 'fiyinfoluwa.sanwo@venturegardengroup.com' OR name ILIKE 'Fiyinfoluwa%' LIMIT 1) AS fiyin,
    (SELECT id FROM employees WHERE lower(email) = 'mariam.adahunse@greenhouse.capital' OR name ILIKE 'Mariam%' LIMIT 1) AS mariam,
    (SELECT id FROM employees WHERE lower(email) = 'faith.aminaho@greenhouse.capital' OR name ILIKE 'Faith Aminaho%' LIMIT 1) AS faith,
    (SELECT id FROM employees WHERE lower(email) = 'anjolaoluwa.jawando@greenhouse.capital' OR name ILIKE 'Anjolaoluwa%' LIMIT 1) AS anjola
)
UPDATE employees e
SET
  ghc_hierarchy_level = 1,
  ghc_manager_id = NULL,
  ghc_secondary_manager_id = NULL,
  ghc_appraisal_active = true
FROM ids WHERE e.id = ids.bunmi;

WITH ids AS (
  SELECT
    (SELECT id FROM employees WHERE lower(email) = 'bunmi.akinyemiju@venturegardengroup.com' OR name ILIKE 'Bunmi Akinyemiju%' LIMIT 1) AS bunmi,
    (SELECT id FROM employees WHERE lower(email) = 'uloma.herrington@greenhouse.capital' OR name ILIKE 'Uloma%' LIMIT 1) AS uloma
)
UPDATE employees e
SET ghc_hierarchy_level = 2, ghc_manager_id = ids.bunmi, ghc_appraisal_active = true
FROM ids WHERE e.id = ids.uloma;

WITH ids AS (
  SELECT
    (SELECT id FROM employees WHERE lower(email) = 'uloma.herrington@greenhouse.capital' OR name ILIKE 'Uloma%' LIMIT 1) AS uloma,
    (SELECT id FROM employees WHERE lower(email) = 'busayo.eniola-giwa@greenhouse.capital' OR name ILIKE 'Busayo%' LIMIT 1) AS busayo,
    (SELECT id FROM employees WHERE lower(email) = 'omotola.akinyemiju@greenhouse.capital' OR name ILIKE 'Omotola Akinyemiju%' LIMIT 1) AS omotola,
    (SELECT id FROM employees WHERE lower(email) = 'phebean.falaye@greenhouse.capital' OR name ILIKE 'Phebean%' LIMIT 1) AS phebean,
    (SELECT id FROM employees WHERE lower(email) = 'fiyinfoluwa.sanwo@venturegardengroup.com' OR name ILIKE 'Fiyinfoluwa%' LIMIT 1) AS fiyin
)
UPDATE employees e
SET ghc_hierarchy_level = 3, ghc_manager_id = ids.uloma, ghc_appraisal_active = true
FROM ids
WHERE e.id IN (ids.busayo, ids.omotola, ids.phebean, ids.fiyin);

WITH ids AS (
  SELECT
    (SELECT id FROM employees WHERE lower(email) = 'busayo.eniola-giwa@greenhouse.capital' OR name ILIKE 'Busayo%' LIMIT 1) AS busayo,
    (SELECT id FROM employees WHERE lower(email) = 'omotola.akinyemiju@greenhouse.capital' OR name ILIKE 'Omotola Akinyemiju%' LIMIT 1) AS omotola,
    (SELECT id FROM employees WHERE lower(email) = 'mariam.adahunse@greenhouse.capital' OR name ILIKE 'Mariam%' LIMIT 1) AS mariam
)
UPDATE employees e
SET ghc_hierarchy_level = 3, ghc_manager_id = ids.busayo, ghc_secondary_manager_id = ids.omotola, ghc_appraisal_active = true
FROM ids WHERE e.id = ids.mariam;

WITH ids AS (
  SELECT
    (SELECT id FROM employees WHERE lower(email) = 'phebean.falaye@greenhouse.capital' OR name ILIKE 'Phebean%' LIMIT 1) AS phebean,
    (SELECT id FROM employees WHERE lower(email) = 'omotola.akinyemiju@greenhouse.capital' OR name ILIKE 'Omotola Akinyemiju%' LIMIT 1) AS omotola,
    (SELECT id FROM employees WHERE lower(email) = 'faith.aminaho@greenhouse.capital' OR name ILIKE 'Faith Aminaho%' LIMIT 1) AS faith,
    (SELECT id FROM employees WHERE lower(email) = 'anjolaoluwa.jawando@greenhouse.capital' OR name ILIKE 'Anjolaoluwa%' LIMIT 1) AS anjola
)
UPDATE employees e
SET ghc_hierarchy_level = 4, ghc_manager_id = ids.phebean, ghc_appraisal_active = true
FROM ids WHERE e.id = ids.faith;

WITH ids AS (
  SELECT
    (SELECT id FROM employees WHERE lower(email) = 'omotola.akinyemiju@greenhouse.capital' OR name ILIKE 'Omotola Akinyemiju%' LIMIT 1) AS omotola,
    (SELECT id FROM employees WHERE lower(email) = 'anjolaoluwa.jawando@greenhouse.capital' OR name ILIKE 'Anjolaoluwa%' LIMIT 1) AS anjola
)
UPDATE employees e
SET ghc_hierarchy_level = 4, ghc_manager_id = ids.omotola, ghc_appraisal_active = true
FROM ids WHERE e.id = ids.anjola;

-- 4) Sanity: active GHC count
SELECT count(*) AS ghc_active_count
FROM public.employees
WHERE coalesce(ghc_appraisal_active, false);
