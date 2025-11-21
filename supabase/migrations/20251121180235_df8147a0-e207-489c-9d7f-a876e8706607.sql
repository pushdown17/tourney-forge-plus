-- Add number_of_fields column to tournaments table
ALTER TABLE public.tournaments 
ADD COLUMN number_of_fields integer DEFAULT 1 CHECK (number_of_fields >= 1 AND number_of_fields <= 4);