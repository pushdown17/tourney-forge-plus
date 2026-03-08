
-- Create the tournament (tournament already inserted in previous attempt, check and skip if exists)
INSERT INTO tournaments (id, name, start_date, end_date, current_phase, elimination_type, teams_for_elimination, created_by, initial_phase, number_of_groups, number_of_fields)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Double Elim 8 Teams',
  now(),
  now() + interval '2 days',
  'elimination',
  'double',
  8,
  '41a49019-5135-4368-ae4b-2550ea3e8fbe',
  'round_robin',
  1,
  1
)
ON CONFLICT (id) DO NOTHING;

-- Link existing teams A-H to the tournament
INSERT INTO tournament_teams (tournament_id, team_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd3d1dd6f-2479-4635-8474-78129515d5c6'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '84dc67ce-654d-44f5-a8d4-adb2421f9663'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '45c97098-7088-4ec8-984b-55503737b561'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '5c6b5c72-ba87-476b-804a-316636e60884'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'b7a26564-7d60-4c3c-b9a8-665457fd3ceb'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '0838ecf6-c45e-42b5-8523-ca07fa71dd1d'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd0a51841-b460-48c4-8e13-070cbee757e2'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd33b0bdd-f88c-488d-a41f-9e9fec029823')
ON CONFLICT DO NOTHING;
