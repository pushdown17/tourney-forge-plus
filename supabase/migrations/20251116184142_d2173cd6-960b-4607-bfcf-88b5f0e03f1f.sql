-- Migration simplifiée : créer la structure globale en parallèle sans casser l'existant

-- Étape 1: Créer les tables de liaison
CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  group_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_team_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_team_id UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tournament_team_id, player_id)
);

-- Étape 2: Identifier un seul joueur/équipe unique par nom
CREATE TEMP TABLE unique_players AS
SELECT DISTINCT ON (name) id, name
FROM public.players
ORDER BY name, created_at ASC;

CREATE TEMP TABLE unique_teams AS
SELECT DISTINCT ON (name) id, name  
FROM public.teams
ORDER BY name, created_at ASC;

-- Étape 3: Peupler tournament_teams en utilisant les équipes uniques
-- (même si les équipes ont des doublons, on lie chaque instance au tournoi)
INSERT INTO public.tournament_teams (tournament_id, team_id, group_name)
SELECT t.tournament_id, t.id, t.group_name
FROM public.teams t
WHERE t.tournament_id IS NOT NULL
ON CONFLICT (tournament_id, team_id) DO NOTHING;

-- Étape 4: Peupler tournament_team_players
INSERT INTO public.tournament_team_players (tournament_team_id, player_id)
SELECT DISTINCT tt.id, p.id
FROM public.players p
JOIN public.teams t ON p.team_id = t.id
JOIN public.tournament_teams tt ON tt.team_id = t.id AND tt.tournament_id = t.tournament_id
ON CONFLICT (tournament_team_id, player_id) DO NOTHING;

-- Étape 5: Ajouter les nouvelles colonnes aux tables existantes
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS tournament_team1_id UUID REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tournament_team2_id UUID REFERENCES public.tournament_teams(id) ON DELETE CASCADE;

ALTER TABLE public.team_stats 
  ADD COLUMN IF NOT EXISTS tournament_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE CASCADE;

ALTER TABLE public.player_stats
  ADD COLUMN IF NOT EXISTS tournament_team_player_id UUID REFERENCES public.tournament_team_players(id) ON DELETE CASCADE;

-- Étape 6: Peupler les nouvelles colonnes
UPDATE public.matches m
SET tournament_team1_id = tt.id
FROM public.tournament_teams tt
WHERE tt.team_id = m.team1_id 
  AND tt.tournament_id = m.tournament_id
  AND m.tournament_team1_id IS NULL;

UPDATE public.matches m
SET tournament_team2_id = tt.id
FROM public.tournament_teams tt
WHERE tt.team_id = m.team2_id 
  AND tt.tournament_id = m.tournament_id
  AND m.tournament_team2_id IS NULL;

UPDATE public.team_stats ts
SET tournament_team_id = tt.id
FROM public.tournament_teams tt
WHERE tt.team_id = ts.team_id 
  AND tt.tournament_id = ts.tournament_id
  AND ts.tournament_team_id IS NULL;

UPDATE public.player_stats ps
SET tournament_team_player_id = ttp.id
FROM public.tournament_team_players ttp
WHERE ttp.player_id = ps.player_id
  AND ps.tournament_team_player_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tournament_teams tt
    WHERE tt.id = ttp.tournament_team_id
    AND tt.tournament_id = ps.tournament_id
  );

-- Étape 7: RLS Policies pour les nouvelles tables
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tournament teams" ON public.tournament_teams;
CREATE POLICY "Anyone can view tournament teams"
  ON public.tournament_teams FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Tournament creators and admins can manage tournament teams" ON public.tournament_teams;
CREATE POLICY "Tournament creators and admins can manage tournament teams"
  ON public.tournament_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments
      WHERE tournaments.id = tournament_teams.tournament_id
      AND tournaments.created_by = auth.uid()
      AND tournaments.is_closed = false
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

ALTER TABLE public.tournament_team_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tournament team players" ON public.tournament_team_players;
CREATE POLICY "Anyone can view tournament team players"
  ON public.tournament_team_players FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Tournament creators and admins can manage tournament team players" ON public.tournament_team_players;
CREATE POLICY "Tournament creators and admins can manage tournament team players"
  ON public.tournament_team_players FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_teams tt
      JOIN public.tournaments t ON t.id = tt.tournament_id
      WHERE tt.id = tournament_team_players.tournament_team_id
      AND t.created_by = auth.uid()
      AND t.is_closed = false
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Étape 8: Mettre à jour les policies de players et teams pour permettre la création globale
DROP POLICY IF EXISTS "Tournament creators and admins can create players" ON public.players;
DROP POLICY IF EXISTS "Tournament creators and admins can update players" ON public.players;
DROP POLICY IF EXISTS "Tournament creators and admins can delete players" ON public.players;

CREATE POLICY "Authenticated users can create players"
  ON public.players FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update players"
  ON public.players FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete players"
  ON public.players FOR DELETE
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Tournament creators and admins can create teams" ON public.teams;
DROP POLICY IF EXISTS "Tournament creators and admins can update teams" ON public.teams;
DROP POLICY IF EXISTS "Tournament creators and admins can delete teams" ON public.teams;

CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update teams"
  ON public.teams FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete teams"
  ON public.teams FOR DELETE
  USING (auth.uid() IS NOT NULL);