-- 1. Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Only admins can manage roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Update tournaments policies to allow admins
DROP POLICY IF EXISTS "Tournament creators can update their tournaments" ON public.tournaments;
CREATE POLICY "Tournament creators and admins can update tournaments"
  ON public.tournaments
  FOR UPDATE
  USING (
    (auth.uid() = created_by AND is_closed = false) 
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can delete their tournaments" ON public.tournaments;
CREATE POLICY "Tournament creators and admins can delete tournaments"
  ON public.tournaments
  FOR DELETE
  USING (
    (auth.uid() = created_by AND is_closed = false) 
    OR public.has_role(auth.uid(), 'admin')
  );

-- 5. Update teams policies
DROP POLICY IF EXISTS "Tournament creators can create teams" ON public.teams;
CREATE POLICY "Tournament creators and admins can create teams"
  ON public.teams
  FOR INSERT
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = teams.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can update teams" ON public.teams;
CREATE POLICY "Tournament creators and admins can update teams"
  ON public.teams
  FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = teams.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can delete teams" ON public.teams;
CREATE POLICY "Tournament creators and admins can delete teams"
  ON public.teams
  FOR DELETE
  USING (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = teams.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 6. Update players policies
DROP POLICY IF EXISTS "Tournament creators can create players" ON public.players;
CREATE POLICY "Tournament creators and admins can create players"
  ON public.players
  FOR INSERT
  WITH CHECK (
    (EXISTS (
      SELECT 1
      FROM teams t
      JOIN tournaments tour ON t.tournament_id = tour.id
      WHERE t.id = players.team_id
        AND tour.created_by = auth.uid()
        AND tour.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can update players" ON public.players;
CREATE POLICY "Tournament creators and admins can update players"
  ON public.players
  FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1
      FROM teams t
      JOIN tournaments tour ON t.tournament_id = tour.id
      WHERE t.id = players.team_id
        AND tour.created_by = auth.uid()
        AND tour.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can delete players" ON public.players;
CREATE POLICY "Tournament creators and admins can delete players"
  ON public.players
  FOR DELETE
  USING (
    (EXISTS (
      SELECT 1
      FROM teams t
      JOIN tournaments tour ON t.tournament_id = tour.id
      WHERE t.id = players.team_id
        AND tour.created_by = auth.uid()
        AND tour.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 7. Update matches policies
DROP POLICY IF EXISTS "Tournament creators can create matches" ON public.matches;
CREATE POLICY "Tournament creators and admins can create matches"
  ON public.matches
  FOR INSERT
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = matches.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can update matches" ON public.matches;
CREATE POLICY "Tournament creators and admins can update matches"
  ON public.matches
  FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = matches.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can delete matches" ON public.matches;
CREATE POLICY "Tournament creators and admins can delete matches"
  ON public.matches
  FOR DELETE
  USING (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = matches.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 8. Update player_stats policies
DROP POLICY IF EXISTS "Tournament creators manage player stats" ON public.player_stats;
CREATE POLICY "Tournament creators and admins manage player stats"
  ON public.player_stats
  FOR ALL
  USING (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = player_stats.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 9. Update team_stats policies
DROP POLICY IF EXISTS "Tournament creators can insert team stats" ON public.team_stats;
CREATE POLICY "Tournament creators and admins can insert team stats"
  ON public.team_stats
  FOR INSERT
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = team_stats.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can update team stats" ON public.team_stats;
CREATE POLICY "Tournament creators and admins can update team stats"
  ON public.team_stats
  FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = team_stats.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Tournament creators can delete team stats" ON public.team_stats;
CREATE POLICY "Tournament creators and admins can delete team stats"
  ON public.team_stats
  FOR DELETE
  USING (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = team_stats.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ))
    OR public.has_role(auth.uid(), 'admin')
  );