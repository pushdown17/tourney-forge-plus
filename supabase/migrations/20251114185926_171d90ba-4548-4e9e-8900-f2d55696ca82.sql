-- Activer l'extension pg_trgm d'abord (pour la recherche floue)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Nettoyer les contraintes redondantes sur la table players
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_name_team_unique;

-- Nettoyer les contraintes redondantes sur la table teams  
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_name_tournament_id_key;

-- Créer des index pour améliorer les performances des recherches d'autocomplétion
CREATE INDEX IF NOT EXISTS idx_players_name_trgm ON public.players USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_teams_name_trgm ON public.teams USING gin (name gin_trgm_ops);