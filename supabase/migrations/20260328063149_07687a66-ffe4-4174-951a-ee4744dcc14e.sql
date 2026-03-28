ALTER TABLE public.tournaments 
  ADD COLUMN IF NOT EXISTS schedule_start_time text DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS match_duration_minutes integer DEFAULT 18,
  ADD COLUMN IF NOT EXISTS break_duration_minutes integer DEFAULT 7;