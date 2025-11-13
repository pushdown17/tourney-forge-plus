
-- Ajouter une contrainte d'unicité sur le nom du joueur par équipe
-- Cela évite qu'un joueur soit dupliqué dans la même équipe
ALTER TABLE public.players
ADD CONSTRAINT players_name_team_unique UNIQUE (name, team_id);

-- Créer un index pour améliorer les performances des recherches par nom
CREATE INDEX idx_players_name ON public.players(name);
