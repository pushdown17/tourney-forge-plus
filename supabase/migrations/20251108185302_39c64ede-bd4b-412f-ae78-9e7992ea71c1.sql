
-- Add unique constraint on tournament_id and name to prevent duplicate teams
ALTER TABLE public.teams
ADD CONSTRAINT teams_tournament_id_name_unique UNIQUE (tournament_id, name);
