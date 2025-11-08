-- Créer le trigger pour mettre à jour automatiquement les statistiques des équipes
CREATE TRIGGER trigger_update_team_stats_after_match
  AFTER UPDATE OF team1_score, team2_score ON public.matches
  FOR EACH ROW
  WHEN (NEW.team1_score IS NOT NULL AND NEW.team2_score IS NOT NULL)
  EXECUTE FUNCTION public.update_team_stats_after_match();