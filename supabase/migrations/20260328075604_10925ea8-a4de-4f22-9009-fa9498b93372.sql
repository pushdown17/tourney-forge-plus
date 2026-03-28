
WITH ranked AS (
  SELECT m.id, 
    ROW_NUMBER() OVER (
      ORDER BY 
        CASE WHEN COALESCE(tt1.group_name, tt2.group_name) = 'Morning' THEN 0 ELSE 1 END ASC,
        m.round_number ASC,
        m.created_at ASC
    ) - 1 AS new_order
  FROM matches m
  LEFT JOIN tournament_teams tt1 ON tt1.team_id = m.team1_id AND tt1.tournament_id = m.tournament_id
  LEFT JOIN tournament_teams tt2 ON tt2.team_id = m.team2_id AND tt2.tournament_id = m.tournament_id
  WHERE m.tournament_id = '0a84f56d-31e6-47e5-976a-d4727b0cafd2'
    AND m.round_number != 99
)
UPDATE matches SET sort_order = ranked.new_order
FROM ranked WHERE matches.id = ranked.id;
