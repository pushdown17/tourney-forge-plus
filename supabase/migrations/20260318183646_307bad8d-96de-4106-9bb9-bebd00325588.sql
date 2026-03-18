
ALTER TABLE public.tournaments 
  ADD COLUMN IF NOT EXISTS is_manually_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_closed_at timestamp with time zone DEFAULT NULL;
