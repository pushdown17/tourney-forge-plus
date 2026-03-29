
-- Reprocess all completed Ultimate Round matches by touching their scores
-- This will trigger the updated function to add their stats

DO $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT id, team1_id, team2_id, team1_score, team2_score, tournament_id 
           FROM matches WHERE round_number = 99 AND team1_score IS NOT NULL AND team2_score IS NOT NULL
  LOOP
    -- Add stats for team1
    INSERT INTO public.team_stats (tournament_id, team_id, wins, losses, draws, goals_for, goals_against, points)
    VALUES (
      m.tournament_id,
      m.team1_id,
      CASE WHEN m.team1_score > m.team2_score THEN 1 ELSE 0 END,
      CASE WHEN m.team1_score < m.team2_score THEN 1 ELSE 0 END,
      CASE WHEN m.team1_score = m.team2_score THEN 1 ELSE 0 END,
      m.team1_score,
      m.team2_score,
      CASE WHEN m.team1_score > m.team2_score THEN 3 WHEN m.team1_score = m.team2_score THEN 1 ELSE 0 END
    )
    ON CONFLICT (tournament_id, team_id) DO UPDATE SET
      wins = team_stats.wins + CASE WHEN m.team1_score > m.team2_score THEN 1 ELSE 0 END,
      losses = team_stats.losses + CASE WHEN m.team1_score < m.team2_score THEN 1 ELSE 0 END,
      draws = team_stats.draws + CASE WHEN m.team1_score = m.team2_score THEN 1 ELSE 0 END,
      goals_for = team_stats.goals_for + m.team1_score,
      goals_against = team_stats.goals_against + m.team2_score,
      points = team_stats.points + CASE WHEN m.team1_score > m.team2_score THEN 3 WHEN m.team1_score = m.team2_score THEN 1 ELSE 0 END;

    -- Add stats for team2
    INSERT INTO public.team_stats (tournament_id, team_id, wins, losses, draws, goals_for, goals_against, points)
    VALUES (
      m.tournament_id,
      m.team2_id,
      CASE WHEN m.team2_score > m.team1_score THEN 1 ELSE 0 END,
      CASE WHEN m.team2_score < m.team1_score THEN 1 ELSE 0 END,
      CASE WHEN m.team2_score = m.team1_score THEN 1 ELSE 0 END,
      m.team2_score,
      m.team1_score,
      CASE WHEN m.team2_score > m.team1_score THEN 3 WHEN m.team2_score = m.team1_score THEN 1 ELSE 0 END
    )
    ON CONFLICT (tournament_id, team_id) DO UPDATE SET
      wins = team_stats.wins + CASE WHEN m.team2_score > m.team1_score THEN 1 ELSE 0 END,
      losses = team_stats.losses + CASE WHEN m.team2_score < m.team1_score THEN 1 ELSE 0 END,
      draws = team_stats.draws + CASE WHEN m.team2_score = m.team1_score THEN 1 ELSE 0 END,
      goals_for = team_stats.goals_for + m.team2_score,
      goals_against = team_stats.goals_against + m.team1_score,
      points = team_stats.points + CASE WHEN m.team2_score > m.team1_score THEN 3 WHEN m.team2_score = m.team1_score THEN 1 ELSE 0 END;
  END LOOP;
END $$;
