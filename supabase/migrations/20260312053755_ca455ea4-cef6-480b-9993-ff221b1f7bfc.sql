DO $$
DECLARE
  tid uuid := 'a7a2e161-9bea-4632-a08c-867b78877a6b';
  team_ids uuid[] := ARRAY[
    'd3d1dd6f-2479-4635-8474-78129515d5c6', -- A → #1
    '84dc67ce-654d-44f5-a8d4-adb2421f9663', -- B → #2
    '45c97098-7088-4ec8-984b-55503737b561', -- C → #3
    '5c6b5c72-ba87-476b-804a-316636e60884', -- D → #4
    'b7a26564-7d60-4c3c-b9a8-665457fd3ceb', -- E → #5
    '0838ecf6-c45e-42b5-8523-ca07fa71dd1d', -- F → #6
    'd0a51841-b460-48c4-8e13-070cbee757e2', -- G → #7
    'd33b0bdd-f88c-488d-a41f-9e9fec029823', -- H → #8
    'c9c76779-cb2b-4eed-98a7-782712dbcefb', -- I → #9
    '4b3d73dc-6f0e-4ce2-84b4-876efd29d17e'  -- J → #10
  ];
  i int;
BEGIN
  -- Clean up existing matches
  DELETE FROM matches WHERE tournament_id = tid;

  -- Insert team_stats with decreasing points (30 for #1 down to 3 for #10)
  DELETE FROM team_stats WHERE tournament_id = tid;
  FOR i IN 1..10 LOOP
    INSERT INTO team_stats (tournament_id, team_id, points, wins, losses, draws, goals_for, goals_against)
    VALUES (tid, team_ids[i], (11 - i) * 3, 11 - i, i - 1, 0, (11 - i) * 2, (i - 1) * 2);
  END LOOP;
END $$;