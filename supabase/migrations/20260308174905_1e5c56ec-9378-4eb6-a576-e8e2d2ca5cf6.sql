
-- Insert team_stats for the 8 teams so they appear in standings with different points (seeding order A=1st to H=8th)
INSERT INTO team_stats (tournament_id, team_id, tournament_team_id, wins, losses, draws, goals_for, goals_against, points)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd3d1dd6f-2479-4635-8474-78129515d5c6', 'afaf1b06-3313-4108-a65f-9bda1f35f5cc', 8, 0, 0, 24, 4,  24),
  ('aaaaaaaa-0000-0000-0000-000000000001', '84dc67ce-654d-44f5-a8d4-adb2421f9663', 'f0784a9b-c406-4b8e-9bad-4fb58d8e8c64', 7, 1, 0, 20, 6,  21),
  ('aaaaaaaa-0000-0000-0000-000000000001', '45c97098-7088-4ec8-984b-55503737b561', 'eb172c57-f270-4083-8768-f3a22838e180', 6, 2, 0, 18, 8,  18),
  ('aaaaaaaa-0000-0000-0000-000000000001', '5c6b5c72-ba87-476b-804a-316636e60884', '134bd8da-7251-4939-88d8-c5befede7a02', 5, 3, 0, 15, 10, 15),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b7a26564-7d60-4c3c-b9a8-665457fd3ceb', 'cd907b74-cf96-4b3e-b05b-39daeab3dc7e', 4, 4, 0, 12, 12, 12),
  ('aaaaaaaa-0000-0000-0000-000000000001', '0838ecf6-c45e-42b5-8523-ca07fa71dd1d', '03e412c7-a999-4f70-a591-e8af096cdb09', 3, 5, 0, 10, 15, 9),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0a51841-b460-48c4-8e13-070cbee757e2', '9c88c083-491b-4697-995f-1736e9183982', 2, 6, 0, 8,  18, 6),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd33b0bdd-f88c-488d-a41f-9e9fec029823', 'cbafd789-5782-43a5-a808-0ad959d495db', 1, 7, 0, 4,  24, 3)
ON CONFLICT (tournament_id, team_id) DO UPDATE SET
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  points = EXCLUDED.points,
  goals_for = EXCLUDED.goals_for,
  goals_against = EXCLUDED.goals_against;
