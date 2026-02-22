
ALTER TABLE public.matches DROP CONSTRAINT matches_field_number_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_field_number_check CHECK (field_number >= 1 AND field_number <= 16);
