
-- Drop existing foreign keys and recreate with CASCADE DELETE

-- matches.tournament_id
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_tournament_id_fkey;
ALTER TABLE public.matches ADD CONSTRAINT matches_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

-- match_events.tournament_id
ALTER TABLE public.match_events DROP CONSTRAINT IF EXISTS match_events_tournament_id_fkey;
ALTER TABLE public.match_events ADD CONSTRAINT match_events_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

-- player_stats.tournament_id
ALTER TABLE public.player_stats DROP CONSTRAINT IF EXISTS player_stats_tournament_id_fkey;
ALTER TABLE public.player_stats ADD CONSTRAINT player_stats_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

-- team_stats.tournament_id
ALTER TABLE public.team_stats DROP CONSTRAINT IF EXISTS team_stats_tournament_id_fkey;
ALTER TABLE public.team_stats ADD CONSTRAINT team_stats_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

-- tournament_teams.tournament_id
ALTER TABLE public.tournament_teams DROP CONSTRAINT IF EXISTS tournament_teams_tournament_id_fkey;
ALTER TABLE public.tournament_teams ADD CONSTRAINT tournament_teams_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

-- referee_stations.tournament_id
ALTER TABLE public.referee_stations DROP CONSTRAINT IF EXISTS referee_stations_tournament_id_fkey;
ALTER TABLE public.referee_stations ADD CONSTRAINT referee_stations_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
