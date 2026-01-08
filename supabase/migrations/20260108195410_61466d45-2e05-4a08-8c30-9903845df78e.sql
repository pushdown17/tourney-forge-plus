-- Add timer columns to referee_stations table
ALTER TABLE public.referee_stations 
ADD COLUMN IF NOT EXISTS timer_duration_seconds INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS timer_paused_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS timer_elapsed_when_paused INTEGER DEFAULT 0;