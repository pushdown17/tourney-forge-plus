-- Create referee_stations table for multi-terrain support
CREATE TABLE public.referee_stations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  station_number INTEGER NOT NULL,
  station_name TEXT NOT NULL DEFAULT 'Terrain',
  current_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, station_number)
);

-- Enable Row Level Security
ALTER TABLE public.referee_stations ENABLE ROW LEVEL SECURITY;

-- Policies: Tournament creators can manage stations
CREATE POLICY "Tournament creators can manage stations"
ON public.referee_stations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments 
    WHERE tournaments.id = referee_stations.tournament_id 
    AND tournaments.created_by = auth.uid()
  )
);

-- Anyone can view stations (for referee access without auth)
CREATE POLICY "Anyone can view stations"
ON public.referee_stations
FOR SELECT
USING (true);

-- Anyone can update current_match (for referee to clear after validation)
CREATE POLICY "Anyone can update station match"
ON public.referee_stations
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Enable realtime for referee_stations
ALTER PUBLICATION supabase_realtime ADD TABLE public.referee_stations;

-- Create trigger for updated_at
CREATE TRIGGER update_referee_stations_updated_at
BEFORE UPDATE ON public.referee_stations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();