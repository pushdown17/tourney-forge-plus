
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order ASC, round_number ASC, created_at ASC) - 1 AS new_order
  FROM matches
  WHERE tournament_id = '0a84f56d-31e6-47e5-976a-d4727b0cafd2'
    AND round_number != 99
)
UPDATE matches SET sort_order = ranked.new_order
FROM ranked WHERE matches.id = ranked.id;
