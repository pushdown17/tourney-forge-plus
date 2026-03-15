CREATE TABLE public.match_referees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  referee_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'present')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(match_id)
);

ALTER TABLE public.match_referees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match referees"
  ON public.match_referees FOR SELECT
  USING (true);

CREATE POLICY "Tournament creators and admins can insert match referees"
  ON public.match_referees FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments
      WHERE tournaments.id = match_referees.tournament_id
        AND tournaments.created_by = auth.uid()
        AND tournaments.is_closed = false
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Tournament creators and admins can update match referees"
  ON public.match_referees FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments
      WHERE tournaments.id = match_referees.tournament_id
        AND tournaments.created_by = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Tournament creators and admins can delete match referees"
  ON public.match_referees FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments
      WHERE tournaments.id = match_referees.tournament_id
        AND tournaments.created_by = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER update_match_referees_updated_at
  BEFORE UPDATE ON public.match_referees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();