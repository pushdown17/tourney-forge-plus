-- Fix player_stats RLS policy to restrict to tournament creators
DROP POLICY IF EXISTS "Authenticated users can manage player stats" ON public.player_stats;

-- Create new policy that checks tournament ownership
CREATE POLICY "Tournament creators manage player stats"
ON public.player_stats FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = player_stats.tournament_id
    AND tournaments.created_by = auth.uid()
    AND tournaments.is_closed = false
  )
);

-- Add database constraints for additional security layer
ALTER TABLE public.player_stats
  ADD CONSTRAINT player_stats_goals_check CHECK (goals >= 0 AND goals <= 999),
  ADD CONSTRAINT player_stats_assists_check CHECK (assists >= 0 AND assists <= 999),
  ADD CONSTRAINT player_stats_fouls_check CHECK (fouls >= 0 AND fouls <= 99),
  ADD CONSTRAINT player_stats_penalty_30s_check CHECK (penalty_30s >= 0 AND penalty_30s <= 99),
  ADD CONSTRAINT player_stats_penalty_1m_check CHECK (penalty_1m >= 0 AND penalty_1m <= 99),
  ADD CONSTRAINT player_stats_penalty_2m_check CHECK (penalty_2m >= 0 AND penalty_2m <= 99);

ALTER TABLE public.teams
  ADD CONSTRAINT teams_name_length_check CHECK (char_length(name) >= 1 AND char_length(name) <= 100);

ALTER TABLE public.players
  ADD CONSTRAINT players_name_length_check CHECK (char_length(name) >= 1 AND char_length(name) <= 100);

ALTER TABLE public.matches
  ADD CONSTRAINT matches_scores_check CHECK (
    (team1_score IS NULL AND team2_score IS NULL) OR 
    (team1_score >= 0 AND team1_score <= 999 AND team2_score >= 0 AND team2_score <= 999)
  );