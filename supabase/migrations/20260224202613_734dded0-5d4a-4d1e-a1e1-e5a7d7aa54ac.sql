
CREATE OR REPLACE FUNCTION public.update_team_stats_after_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip elimination phase matches - they should not affect overall ranking
  IF NEW.phase IN ('elimination', 'single_elimination', 'double_elimination') THEN
    RETURN NEW;
  END IF;

  -- Skip Ultimate Round matches (crossover matches between groups)
  IF NEW.round_number = 99 THEN
    RETURN NEW;
  END IF;

  -- Supprimer les anciennes stats pour ce match (au cas où il y en a)
  IF OLD.team1_score IS NOT NULL AND OLD.team2_score IS NOT NULL AND OLD.phase NOT IN ('elimination', 'single_elimination', 'double_elimination') AND OLD.round_number != 99 THEN
    -- Soustraire les anciennes stats
    UPDATE public.team_stats SET
      wins = GREATEST(0, wins - CASE WHEN OLD.team1_score > OLD.team2_score THEN 1 ELSE 0 END),
      losses = GREATEST(0, losses - CASE WHEN OLD.team1_score < OLD.team2_score THEN 1 ELSE 0 END),
      draws = GREATEST(0, draws - CASE WHEN OLD.team1_score = OLD.team2_score THEN 1 ELSE 0 END),
      goals_for = GREATEST(0, goals_for - OLD.team1_score),
      goals_against = GREATEST(0, goals_against - OLD.team2_score),
      points = GREATEST(0, points - CASE WHEN OLD.team1_score > OLD.team2_score THEN 3 WHEN OLD.team1_score = OLD.team2_score THEN 1 ELSE 0 END)
    WHERE tournament_id = OLD.tournament_id AND team_id = OLD.team1_id;
    
    UPDATE public.team_stats SET
      wins = GREATEST(0, wins - CASE WHEN OLD.team2_score > OLD.team1_score THEN 1 ELSE 0 END),
      losses = GREATEST(0, losses - CASE WHEN OLD.team2_score < OLD.team1_score THEN 1 ELSE 0 END),
      draws = GREATEST(0, draws - CASE WHEN OLD.team2_score = OLD.team1_score THEN 1 ELSE 0 END),
      goals_for = GREATEST(0, goals_for - OLD.team2_score),
      goals_against = GREATEST(0, goals_against - OLD.team1_score),
      points = GREATEST(0, points - CASE WHEN OLD.team2_score > OLD.team1_score THEN 3 WHEN OLD.team2_score = OLD.team1_score THEN 1 ELSE 0 END)
    WHERE tournament_id = OLD.tournament_id AND team_id = OLD.team2_id;
  END IF;

  -- Ajouter les nouvelles stats uniquement si le match a des scores
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
$function$;
