-- Ajouter une colonne pour identifier le match de 3ème place
ALTER TABLE public.matches 
ADD COLUMN is_third_place_match BOOLEAN NOT NULL DEFAULT false;

-- Ajouter un commentaire pour clarifier
COMMENT ON COLUMN public.matches.is_third_place_match IS 'Indique si ce match est un match pour la 3ème place (petite finale)';