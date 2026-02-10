
-- Fix 1: Restrict teams table write access to tournament creators/admins
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can update teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can delete teams" ON public.teams;

-- Allow authenticated users to create teams (needed for adding teams to tournaments)
CREATE POLICY "Authenticated users can create teams"
ON public.teams
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Only allow update/delete if user is creator of a tournament that uses this team, or is admin
CREATE POLICY "Tournament creators and admins can update teams"
ON public.teams
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tournament_teams tt
    JOIN public.tournaments t ON t.id = tt.tournament_id
    WHERE tt.team_id = teams.id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Tournament creators and admins can delete teams"
ON public.teams
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tournament_teams tt
    JOIN public.tournaments t ON t.id = tt.tournament_id
    WHERE tt.team_id = teams.id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Fix 2: Restrict players table write access
DROP POLICY IF EXISTS "Authenticated users can create players" ON public.players;
DROP POLICY IF EXISTS "Authenticated users can update players" ON public.players;
DROP POLICY IF EXISTS "Authenticated users can delete players" ON public.players;

-- Allow authenticated users to create players (needed when adding players to teams)
CREATE POLICY "Authenticated users can create players"
ON public.players
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Only allow update/delete if user is creator of a tournament that uses this player's team, or is admin
CREATE POLICY "Tournament creators and admins can update players"
ON public.players
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tournament_team_players ttp
    JOIN public.tournament_teams tt ON tt.id = ttp.tournament_team_id
    JOIN public.tournaments t ON t.id = tt.tournament_id
    WHERE ttp.player_id = players.id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Tournament creators and admins can delete players"
ON public.players
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tournament_team_players ttp
    JOIN public.tournament_teams tt ON tt.id = ttp.tournament_team_id
    JOIN public.tournaments t ON t.id = tt.tournament_id
    WHERE ttp.player_id = players.id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Fix 3: Restrict referee_stations UPDATE to tournament creators/admins only
DROP POLICY IF EXISTS "Authenticated users can update station match" ON public.referee_stations;

CREATE POLICY "Tournament creators and admins can update stations"
ON public.referee_stations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = referee_stations.tournament_id
    AND (tournaments.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);
