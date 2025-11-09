-- Fix teams table RLS policies to require tournament ownership validation

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can create teams" ON teams;
DROP POLICY IF EXISTS "Authenticated users can update teams" ON teams;
DROP POLICY IF EXISTS "Authenticated users can delete teams" ON teams;

-- Create new policies that require tournament ownership
CREATE POLICY "Tournament creators can create teams"
ON teams FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = teams.tournament_id
    AND tournaments.created_by = auth.uid()
    AND tournaments.is_closed = false
  )
);

CREATE POLICY "Tournament creators can update teams"
ON teams FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = teams.tournament_id
    AND tournaments.created_by = auth.uid()
    AND tournaments.is_closed = false
  )
);

CREATE POLICY "Tournament creators can delete teams"
ON teams FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = teams.tournament_id
    AND tournaments.created_by = auth.uid()
    AND tournaments.is_closed = false
  )
);