-- Rendre team_id et tournament_id nullable pour la structure globale

-- Retirer la contrainte NOT NULL de players.team_id
ALTER TABLE public.players ALTER COLUMN team_id DROP NOT NULL;

-- Retirer la contrainte NOT NULL de teams.tournament_id
ALTER TABLE public.teams ALTER COLUMN tournament_id DROP NOT NULL;