-- Supprimer l'ancien trigger
DROP TRIGGER IF EXISTS trigger_update_team_stats_after_match ON public.matches;

-- Recréer le trigger pour qu'il ne se déclenche que sur la première validation du score
CREATE TRIGGER trigger_update_team_stats_after_match
  AFTER UPDATE OF team1_score, team2_score ON public.matches
  FOR EACH ROW
  WHEN (
    NEW.team1_score IS NOT NULL 
    AND NEW.team2_score IS NOT NULL 
    AND (OLD.team1_score IS NULL OR OLD.team2_score IS NULL)
  )
  EXECUTE FUNCTION public.update_team_stats_after_match();