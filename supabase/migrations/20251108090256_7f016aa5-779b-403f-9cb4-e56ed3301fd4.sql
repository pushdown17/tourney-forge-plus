-- Update RLS policies for players table to allow public access
DROP POLICY IF EXISTS "Authenticated users can create players" ON public.players;
DROP POLICY IF EXISTS "Authenticated users can delete players" ON public.players;
DROP POLICY IF EXISTS "Authenticated users can update players" ON public.players;

-- Create new public policies
CREATE POLICY "Anyone can create players" ON public.players
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Anyone can update players" ON public.players
  FOR UPDATE 
  USING (true);

CREATE POLICY "Anyone can delete players" ON public.players
  FOR DELETE 
  USING (true);