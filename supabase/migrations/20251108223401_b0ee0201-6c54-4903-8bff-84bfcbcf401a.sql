-- Fix matches table RLS policies to verify tournament ownership

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can create matches" ON matches;
DROP POLICY IF EXISTS "Authenticated users can update matches" ON matches;
DROP POLICY IF EXISTS "Authenticated users can delete matches" ON matches;

-- Create new policies with tournament creator validation
CREATE POLICY "Tournament creators can create matches"
ON matches FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = matches.tournament_id
    AND tournaments.created_by = auth.uid()
    AND tournaments.is_closed = false
  )
);

CREATE POLICY "Tournament creators can update matches"
ON matches FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = matches.tournament_id
    AND tournaments.created_by = auth.uid()
    AND tournaments.is_closed = false
  )
);

CREATE POLICY "Tournament creators can delete matches"
ON matches FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = matches.tournament_id
    AND tournaments.created_by = auth.uid()
    AND tournaments.is_closed = false
  )
);