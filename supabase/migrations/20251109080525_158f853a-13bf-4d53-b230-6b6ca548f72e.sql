-- Fix players table RLS policies to require tournament ownership validation

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can create players" ON players;
DROP POLICY IF EXISTS "Anyone can update players" ON players;
DROP POLICY IF EXISTS "Anyone can delete players" ON players;

-- Create new policies that require authentication and tournament ownership
CREATE POLICY "Tournament creators can create players"
ON players FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM teams t
    JOIN tournaments tour ON t.tournament_id = tour.id
    WHERE t.id = players.team_id
    AND tour.created_by = auth.uid()
    AND tour.is_closed = false
  )
);

CREATE POLICY "Tournament creators can update players"
ON players FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM teams t
    JOIN tournaments tour ON t.tournament_id = tour.id
    WHERE t.id = players.team_id
    AND tour.created_by = auth.uid()
    AND tour.is_closed = false
  )
);

CREATE POLICY "Tournament creators can delete players"
ON players FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM teams t
    JOIN tournaments tour ON t.tournament_id = tour.id
    WHERE t.id = players.team_id
    AND tour.created_by = auth.uid()
    AND tour.is_closed = false
  )
);