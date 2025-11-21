-- Add field_number column to matches table
ALTER TABLE public.matches 
ADD COLUMN field_number integer CHECK (field_number >= 1 AND field_number <= 4);