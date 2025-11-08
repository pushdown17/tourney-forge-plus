-- Fix function search path security issues
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_team_stats_after_match()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if match has scores
  IF NEW.team1_score IS NOT NULL AND NEW.team2_score IS NOT NULL THEN
    -- Update team1 stats
    INSERT INTO public.team_stats (tournament_id, team_id, wins, losses, draws, goals_for, goals_against, points)
    VALUES (
      NEW.tournament_id,
      NEW.team1_id,
      CASE WHEN NEW.team1_score > NEW.team2_score THEN 1 ELSE 0 END,
      CASE WHEN NEW.team1_score < NEW.team2_score THEN 1 ELSE 0 END,
      CASE WHEN NEW.team1_score = NEW.team2_score THEN 1 ELSE 0 END,
      NEW.team1_score,
      NEW.team2_score,
      CASE WHEN NEW.team1_score > NEW.team2_score THEN 3 WHEN NEW.team1_score = NEW.team2_score THEN 1 ELSE 0 END
    )
    ON CONFLICT (tournament_id, team_id) DO UPDATE SET
      wins = team_stats.wins + CASE WHEN NEW.team1_score > NEW.team2_score THEN 1 ELSE 0 END,
      losses = team_stats.losses + CASE WHEN NEW.team1_score < NEW.team2_score THEN 1 ELSE 0 END,
      draws = team_stats.draws + CASE WHEN NEW.team1_score = NEW.team2_score THEN 1 ELSE 0 END,
      goals_for = team_stats.goals_for + NEW.team1_score,
      goals_against = team_stats.goals_against + NEW.team2_score,
      points = team_stats.points + CASE WHEN NEW.team1_score > NEW.team2_score THEN 3 WHEN NEW.team1_score = NEW.team2_score THEN 1 ELSE 0 END;
    
    -- Update team2 stats
    INSERT INTO public.team_stats (tournament_id, team_id, wins, losses, draws, goals_for, goals_against, points)
    VALUES (
      NEW.tournament_id,
      NEW.team2_id,
      CASE WHEN NEW.team2_score > NEW.team1_score THEN 1 ELSE 0 END,
      CASE WHEN NEW.team2_score < NEW.team1_score THEN 1 ELSE 0 END,
      CASE WHEN NEW.team2_score = NEW.team1_score THEN 1 ELSE 0 END,
      NEW.team2_score,
      NEW.team1_score,
      CASE WHEN NEW.team2_score > NEW.team1_score THEN 3 WHEN NEW.team2_score = NEW.team1_score THEN 1 ELSE 0 END
    )
    ON CONFLICT (tournament_id, team_id) DO UPDATE SET
      wins = team_stats.wins + CASE WHEN NEW.team2_score > NEW.team1_score THEN 1 ELSE 0 END,
      losses = team_stats.losses + CASE WHEN NEW.team2_score < NEW.team1_score THEN 1 ELSE 0 END,
      draws = team_stats.draws + CASE WHEN NEW.team2_score = NEW.team1_score THEN 1 ELSE 0 END,
      goals_for = team_stats.goals_for + NEW.team2_score,
      goals_against = team_stats.goals_against + NEW.team1_score,
      points = team_stats.points + CASE WHEN NEW.team2_score > NEW.team1_score THEN 3 WHEN NEW.team2_score = NEW.team1_score THEN 1 ELSE 0 END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;