
-- Create match_events table for timeline
CREATE TABLE public.match_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id),
  player_name TEXT NOT NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id),
  event_type TEXT NOT NULL, -- 'goal', 'assist', 'foul', 'penalty_30s', 'penalty_1m', 'penalty_2m'
  match_time TEXT NOT NULL, -- e.g. '08:44'
  score_at_event TEXT, -- e.g. '1 - 0'
  delta INTEGER NOT NULL DEFAULT 1, -- +1 or -1 for corrections
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match events" ON public.match_events
  FOR SELECT USING (true);

CREATE POLICY "Tournament creators and admins can manage match events" ON public.match_events
  FOR ALL USING (
    (EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = match_events.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    )) OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;
