-- Merge duplicate teams by name (case-insensitive)
-- Step 1: Update tournament_teams references
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids,
    LOWER(name) AS lname
  FROM public.teams
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS team_id
  FROM duplicates
)
UPDATE public.tournament_teams tt
SET team_id = e.keep_id
FROM expanded e
WHERE tt.team_id = e.team_id
  AND e.team_id <> e.keep_id;

-- Step 2: Update team_stats references
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids,
    LOWER(name) AS lname
  FROM public.teams
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS team_id
  FROM duplicates
)
UPDATE public.team_stats ts
SET team_id = e.keep_id
FROM expanded e
WHERE ts.team_id = e.team_id
  AND e.team_id <> e.keep_id;

-- Step 3: Update players references
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids,
    LOWER(name) AS lname
  FROM public.teams
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS team_id
  FROM duplicates
)
UPDATE public.players p
SET team_id = e.keep_id
FROM expanded e
WHERE p.team_id = e.team_id
  AND e.team_id <> e.keep_id;

-- Step 4: Update matches team1_id references
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids,
    LOWER(name) AS lname
  FROM public.teams
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS team_id
  FROM duplicates
)
UPDATE public.matches m
SET team1_id = e.keep_id
FROM expanded e
WHERE m.team1_id = e.team_id
  AND e.team_id <> e.keep_id;

-- Step 5: Update matches team2_id references
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids,
    LOWER(name) AS lname
  FROM public.teams
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS team_id
  FROM duplicates
)
UPDATE public.matches m
SET team2_id = e.keep_id
FROM expanded e
WHERE m.team2_id = e.team_id
  AND e.team_id <> e.keep_id;

-- Step 6: Update matches winner_id references
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids,
    LOWER(name) AS lname
  FROM public.teams
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS team_id
  FROM duplicates
)
UPDATE public.matches m
SET winner_id = e.keep_id
FROM expanded e
WHERE m.winner_id = e.team_id
  AND e.team_id <> e.keep_id;

-- Step 7: Delete duplicate team rows keeping only one per name
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids
  FROM public.teams
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS team_id
  FROM duplicates
)
DELETE FROM public.teams t
USING expanded e
WHERE t.id = e.team_id
  AND e.team_id <> e.keep_id;

-- Step 8: Add a unique index on lower(name) to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS teams_name_lower_key
  ON public.teams (LOWER(name));