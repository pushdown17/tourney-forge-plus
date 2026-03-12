DO $$
DECLARE
  v_tournament_id uuid;
  team_ids uuid[] := ARRAY[
    '6348661e-44da-48f5-be5b-9554cdd73a7e',
    '1802359d-0ea3-41c7-978d-436f9759c60d',
    'a4d039f3-1b68-47d5-9176-585c3b373ce9',
    '8320ec28-57f3-4234-ab12-0e60db7f985d',
    '8f79b8fe-7060-4b3c-916e-0d76e26e84a2',
    '340535c6-53f7-4719-b912-b39dfda2b64d',
    'c494a15a-137c-4ded-8dbc-0d0ea6c60552',
    'c4a3c752-20fe-49b4-bf2c-c0fab9d3e1fb',
    'f04bd825-c2c2-494b-978d-c6c00efe9942',
    '08be28f3-cba4-4357-aa9e-ed3703cec3c2'
  ];
  i int;
BEGIN
  INSERT INTO tournaments (created_by, name, teams_for_elimination, start_date, end_date, initial_phase, current_phase, number_of_fields, elimination_type, number_of_groups)
  VALUES ('41a49019-5135-4368-ae4b-2550ea3e8fbe', 'Test Single Elim 10 Teams', 10, '2026-03-12', '2026-03-12', 'single_elimination', 'single_elimination', 1, 'single', 1)
  RETURNING id INTO v_tournament_id;

  FOR i IN 1..10 LOOP
    INSERT INTO tournament_teams (tournament_id, team_id) VALUES (v_tournament_id, team_ids[i]);
  END LOOP;
END $$;