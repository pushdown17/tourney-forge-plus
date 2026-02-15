-- Ensure only one account can be linked to a given player
ALTER TABLE public.profiles ADD CONSTRAINT profiles_linked_player_id_unique UNIQUE (linked_player_id);