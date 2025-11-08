-- Create enum for tournament phases
CREATE TYPE public.tournament_phase AS ENUM ('round_robin', 'elimination');

-- Create enum for match result types
CREATE TYPE public.match_result AS ENUM ('win', 'loss', 'draw');

-- Create enum for elimination type
CREATE TYPE public.elimination_type AS ENUM ('single', 'double');

-- Create tournaments table
CREATE TABLE public.tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  current_phase public.tournament_phase NOT NULL DEFAULT 'round_robin',
  elimination_type public.elimination_type,
  teams_for_elimination INTEGER,
  created_by UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name, tournament_id)
);

-- Create players table
CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create matches table
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  phase public.tournament_phase NOT NULL,
  round_number INTEGER NOT NULL,
  team1_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  team2_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  team1_score INTEGER,
  team2_score INTEGER,
  winner_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  match_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team statistics table
CREATE TABLE public.team_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  goals_for INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, team_id)
);

-- Enable Row Level Security
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tournaments (everyone can view, only creator can modify)
CREATE POLICY "Anyone can view tournaments"
  ON public.tournaments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create tournaments"
  ON public.tournaments FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Tournament creators can update their tournaments"
  ON public.tournaments FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Tournament creators can delete their tournaments"
  ON public.tournaments FOR DELETE
  USING (auth.uid() = created_by);

-- RLS Policies for teams (everyone can view, authenticated can create)
CREATE POLICY "Anyone can view teams"
  ON public.teams FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update teams"
  ON public.teams FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete teams"
  ON public.teams FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for players (everyone can view, authenticated can create)
CREATE POLICY "Anyone can view players"
  ON public.players FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create players"
  ON public.players FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update players"
  ON public.players FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete players"
  ON public.players FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for matches (everyone can view, authenticated can modify)
CREATE POLICY "Anyone can view matches"
  ON public.matches FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create matches"
  ON public.matches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update matches"
  ON public.matches FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete matches"
  ON public.matches FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for team_stats (everyone can view, system updates)
CREATE POLICY "Anyone can view team stats"
  ON public.team_stats FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage team stats"
  ON public.team_stats FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_stats_updated_at
  BEFORE UPDATE ON public.team_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update team statistics after match result
CREATE OR REPLACE FUNCTION public.update_team_stats_after_match()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if match has scores
  IF NEW.team1_score IS NOT NULL AND NEW.team2_score IS NOT NULL THEN
    -- Update team1 stats
    INSERT INTO public.team_stats (tournament_id, team_id, wins, losses, draws, goals_for, goals_against, points)
    VALUES (
      NEW.tournament_id,
      NEW.team1_id,
      CASE WHEN NEW.team1_score > NEW.team2_score THEN 1 ELSE 0 END,
      CASE WHEN NEW.team1_score < NEW.team2_score THEN 1 ELSE 0 END,
      CASE WHEN NEW.team1_score = NEW.team2_score THEN 1 ELSE 0 END,
      NEW.team1_score,
      NEW.team2_score,
      CASE WHEN NEW.team1_score > NEW.team2_score THEN 3 WHEN NEW.team1_score = NEW.team2_score THEN 1 ELSE 0 END
    )
    ON CONFLICT (tournament_id, team_id) DO UPDATE SET
      wins = team_stats.wins + CASE WHEN NEW.team1_score > NEW.team2_score THEN 1 ELSE 0 END,
      losses = team_stats.losses + CASE WHEN NEW.team1_score < NEW.team2_score THEN 1 ELSE 0 END,
      draws = team_stats.draws + CASE WHEN NEW.team1_score = NEW.team2_score THEN 1 ELSE 0 END,
      goals_for = team_stats.goals_for + NEW.team1_score,
      goals_against = team_stats.goals_against + NEW.team2_score,
      points = team_stats.points + CASE WHEN NEW.team1_score > NEW.team2_score THEN 3 WHEN NEW.team1_score = NEW.team2_score THEN 1 ELSE 0 END;
    
    -- Update team2 stats
    INSERT INTO public.team_stats (tournament_id, team_id, wins, losses, draws, goals_for, goals_against, points)
    VALUES (
      NEW.tournament_id,
      NEW.team2_id,
      CASE WHEN NEW.team2_score > NEW.team1_score THEN 1 ELSE 0 END,
      CASE WHEN NEW.team2_score < NEW.team1_score THEN 1 ELSE 0 END,
      CASE WHEN NEW.team2_score = NEW.team1_score THEN 1 ELSE 0 END,
      NEW.team2_score,
      NEW.team1_score,
      CASE WHEN NEW.team2_score > NEW.team1_score THEN 3 WHEN NEW.team2_score = NEW.team1_score THEN 1 ELSE 0 END
    )
    ON CONFLICT (tournament_id, team_id) DO UPDATE SET
      wins = team_stats.wins + CASE WHEN NEW.team2_score > NEW.team1_score THEN 1 ELSE 0 END,
      losses = team_stats.losses + CASE WHEN NEW.team2_score < NEW.team1_score THEN 1 ELSE 0 END,
      draws = team_stats.draws + CASE WHEN NEW.team2_score = NEW.team1_score THEN 1 ELSE 0 END,
      goals_for = team_stats.goals_for + NEW.team2_score,
      goals_against = team_stats.goals_against + NEW.team1_score,
      points = team_stats.points + CASE WHEN NEW.team2_score > NEW.team1_score THEN 3 WHEN NEW.team2_score = NEW.team1_score THEN 1 ELSE 0 END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update stats when match is updated
CREATE TRIGGER update_stats_after_match_result
  AFTER INSERT OR UPDATE OF team1_score, team2_score ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_team_stats_after_match();