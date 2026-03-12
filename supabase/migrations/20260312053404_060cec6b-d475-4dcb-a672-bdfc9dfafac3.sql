DO $$
DECLARE
  v_tournament_id uuid;
  team_ids uuid[] := ARRAY[
    'd3d1dd6f-2479-4635-8474-78129515d5c6',
    '84dc67ce-654d-44f5-a8d4-adb2421f9663',
    '45c97098-7088-4ec8-984b-55503737b561',
    '5c6b5c72-ba87-476b-804a-316636e60884',
    'b7a26564-7d60-4c3c-b9a8-665457fd3ceb',
    '0838ecf6-c45e-42b5-8523-ca07fa71dd1d',
    'd0a51841-b460-48c4-8e13-070cbee757e2',
    'd33b0bdd-f88c-488d-a41f-9e9fec029823',
    'c9c76779-cb2b-4eed-98a7-782712dbcefb',
    '4b3d73dc-6f0e-4ce2-84b4-876efd29d17e'
  ];
  i int;
BEGIN
  INSERT INTO tournaments (created_by, name, teams_for_elimination, start_date, end_date, initial_phase, current_phase, number_of_fields, elimination_type, number_of_groups)
  VALUES ('41a49019-5135-4368-ae4b-2550ea3e8fbe', 'Single Elim 10 équipes', 10, '2026-03-12', '2026-03-12', 'single_elimination', 'single_elimination', 1, 'single', 1)
  RETURNING id INTO v_tournament_id;

  FOR i IN 1..10 LOOP
    INSERT INTO tournament_teams (tournament_id, team_id) VALUES (v_tournament_id, team_ids[i]);
  END LOOP;
END $$;