-- Add group information to teams table
ALTER TABLE public.teams ADD COLUMN group_name text;

-- Add number of groups to tournaments table
ALTER TABLE public.tournaments ADD COLUMN number_of_groups integer DEFAULT 1;