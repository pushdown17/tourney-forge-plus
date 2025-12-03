
-- 1. Rendre les équipes indépendantes des tournois
-- Supprimer tournament_id de la table teams (le lien se fait via tournament_teams)
ALTER TABLE public.teams DROP COLUMN IF EXISTS tournament_id;

-- Supprimer group_name de teams (déjà présent dans tournament_teams)
ALTER TABLE public.teams DROP COLUMN IF EXISTS group_name;

-- 2. Rendre les stats indépendantes (nullable pour conserver l'historique)
-- Pour player_stats
ALTER TABLE public.player_stats 
  ALTER COLUMN tournament_id DROP NOT NULL,
  ALTER COLUMN player_id DROP NOT NULL;

-- Pour team_stats
ALTER TABLE public.team_stats 
  ALTER COLUMN tournament_id DROP NOT NULL,
  ALTER COLUMN team_id DROP NOT NULL;

-- 3. S'assurer que les matchs ne sont pas supprimés en cascade
ALTER TABLE public.matches
  ALTER COLUMN tournament_id DROP NOT NULL;
