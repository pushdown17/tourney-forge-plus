-- Create player_stats table for individual player statistics
CREATE TABLE public.player_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  fouls INTEGER NOT NULL DEFAULT 0,
  penalty_30s INTEGER NOT NULL DEFAULT 0,
  penalty_1m INTEGER NOT NULL DEFAULT 0,
  penalty_2m INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for player_stats
CREATE POLICY "Anyone can view player stats"
ON public.player_stats
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage player stats"
ON public.player_stats
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX idx_player_stats_player_id ON public.player_stats(player_id);
CREATE INDEX idx_player_stats_tournament_id ON public.player_stats(tournament_id);
CREATE INDEX idx_player_stats_match_id ON public.player_stats(match_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_player_stats_updated_at
BEFORE UPDATE ON public.player_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();