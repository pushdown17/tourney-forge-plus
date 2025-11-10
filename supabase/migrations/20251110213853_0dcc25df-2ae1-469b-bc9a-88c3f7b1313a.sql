-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage team stats" ON public.team_stats;

-- Create new restrictive policies for team_stats
CREATE POLICY "Tournament creators can insert team stats" 
ON public.team_stats 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = team_stats.tournament_id
      AND tournaments.created_by = auth.uid()
      AND tournaments.is_closed = false
  )
);

CREATE POLICY "Tournament creators can update team stats" 
ON public.team_stats 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = team_stats.tournament_id
      AND tournaments.created_by = auth.uid()
      AND tournaments.is_closed = false
  )
);

CREATE POLICY "Tournament creators can delete team stats" 
ON public.team_stats 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = team_stats.tournament_id
      AND tournaments.created_by = auth.uid()
      AND tournaments.is_closed = false
  )
);