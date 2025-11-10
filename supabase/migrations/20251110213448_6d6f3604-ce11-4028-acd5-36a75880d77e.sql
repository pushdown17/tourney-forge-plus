-- Add initial_phase column to store the original tournament format
ALTER TABLE public.tournaments 
ADD COLUMN initial_phase tournament_phase;

-- Update existing tournaments to set their initial_phase
-- If currently in round_robin or swiss, use that as initial_phase
UPDATE public.tournaments 
SET initial_phase = current_phase 
WHERE current_phase IN ('round_robin', 'swiss');

-- If currently in elimination phase, deduce from context (default to round_robin)
UPDATE public.tournaments 
SET initial_phase = 'round_robin' 
WHERE current_phase IN ('single_elimination', 'double_elimination') AND initial_phase IS NULL;