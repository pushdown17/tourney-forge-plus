
-- Add unique constraint on team_id and name to prevent duplicate players
ALTER TABLE public.players
ADD CONSTRAINT players_team_id_name_unique UNIQUE (team_id, name);
