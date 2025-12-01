-- Merge duplicate players by name (case-insensitive)
-- Step 1: Update all tournament_team_players references to point to the first occurrence
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids,
    LOWER(name) AS lname
  FROM public.players
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS player_id
  FROM duplicates
)
UPDATE public.tournament_team_players ttp
SET player_id = e.keep_id
FROM expanded e
WHERE ttp.player_id = e.player_id
  AND e.player_id <> e.keep_id;

-- Step 2: Update all player_stats references
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids,
    LOWER(name) AS lname
  FROM public.players
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS player_id
  FROM duplicates
)
UPDATE public.player_stats ps
SET player_id = e.keep_id
FROM expanded e
WHERE ps.player_id = e.player_id
  AND e.player_id <> e.keep_id;

-- Step 3: Delete duplicate player rows keeping only one per name
WITH duplicates AS (
  SELECT
    (ARRAY_AGG(id ORDER BY id))[1] AS keep_id,
    ARRAY_AGG(id ORDER BY id) AS all_ids
  FROM public.players
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
), expanded AS (
  SELECT
    keep_id,
    UNNEST(all_ids) AS player_id
  FROM duplicates
)
DELETE FROM public.players p
USING expanded e
WHERE p.id = e.player_id
  AND e.player_id <> e.keep_id;

-- Step 4: Add a unique index on lower(name) to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS players_name_lower_key
  ON public.players (LOWER(name));