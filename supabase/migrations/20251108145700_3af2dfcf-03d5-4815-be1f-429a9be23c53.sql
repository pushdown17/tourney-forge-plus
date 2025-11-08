-- Add is_closed field to tournaments
ALTER TABLE public.tournaments ADD COLUMN is_closed boolean NOT NULL DEFAULT false;

-- Update RLS policies for tournaments to prevent updates/deletes on closed tournaments
DROP POLICY IF EXISTS "Tournament creators can update their tournaments" ON public.tournaments;
CREATE POLICY "Tournament creators can update their tournaments"
ON public.tournaments
FOR UPDATE
USING (auth.uid() = created_by AND is_closed = false);

DROP POLICY IF EXISTS "Tournament creators can delete their tournaments" ON public.tournaments;
CREATE POLICY "Tournament creators can delete their tournaments"
ON public.tournaments
FOR DELETE
USING (auth.uid() = created_by AND is_closed = false);

-- Update RLS policies for teams to prevent modifications on closed tournaments
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
CREATE POLICY "Authenticated users can create teams"
ON public.teams
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.tournaments 
    WHERE id = tournament_id 
    AND is_closed = false
  )
);

DROP POLICY IF EXISTS "Authenticated users can update teams" ON public.teams;
CREATE POLICY "Authenticated users can update teams"
ON public.teams
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.tournaments 
    WHERE id = tournament_id 
    AND is_closed = false
  )
);

DROP POLICY IF EXISTS "Authenticated users can delete teams" ON public.teams;
CREATE POLICY "Authenticated users can delete teams"
ON public.teams
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.tournaments 
    WHERE id = tournament_id 
    AND is_closed = false
  )
);

-- Update RLS policies for matches to prevent modifications on closed tournaments
DROP POLICY IF EXISTS "Authenticated users can create matches" ON public.matches;
CREATE POLICY "Authenticated users can create matches"
ON public.matches
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.tournaments 
    WHERE id = tournament_id 
    AND is_closed = false
  )
);

DROP POLICY IF EXISTS "Authenticated users can update matches" ON public.matches;
CREATE POLICY "Authenticated users can update matches"
ON public.matches
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.tournaments 
    WHERE id = tournament_id 
    AND is_closed = false
  )
);

DROP POLICY IF EXISTS "Authenticated users can delete matches" ON public.matches;
CREATE POLICY "Authenticated users can delete matches"
ON public.matches
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.tournaments 
    WHERE id = tournament_id 
    AND is_closed = false
  )
);

-- Update RLS policies for players to prevent modifications if their team's tournament is closed
DROP POLICY IF EXISTS "Anyone can create players" ON public.players;
CREATE POLICY "Anyone can create players"
ON public.players
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.tournaments tour ON t.tournament_id = tour.id
    WHERE t.id = team_id 
    AND tour.is_closed = false
  )
);

DROP POLICY IF EXISTS "Anyone can update players" ON public.players;
CREATE POLICY "Anyone can update players"
ON public.players
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.tournaments tour ON t.tournament_id = tour.id
    WHERE t.id = team_id 
    AND tour.is_closed = false
  )
);

DROP POLICY IF EXISTS "Anyone can delete players" ON public.players;
CREATE POLICY "Anyone can delete players"
ON public.players
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.tournaments tour ON t.tournament_id = tour.id
    WHERE t.id = team_id 
    AND tour.is_closed = false
  )
);