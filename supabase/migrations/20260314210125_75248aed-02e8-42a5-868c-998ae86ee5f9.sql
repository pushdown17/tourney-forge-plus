
DO $$
DECLARE
  v_tournament_id UUID := gen_random_uuid();
  v_user_id UUID := '37998aac-55d5-4159-91b5-5ad34bc4880d';
  v_teams UUID[] := ARRAY[
    '6348661e-44da-48f5-be5b-9554cdd73a7e'::UUID,
    '1802359d-0ea3-41c7-978d-436f9759c60d'::UUID,
    'a4d039f3-1b68-47d5-9176-585c3b373ce9'::UUID,
    '8320ec28-57f3-4234-ab12-0e60db7f985d'::UUID,
    '8f79b8fe-7060-4b3c-916e-0d76e26e84a2'::UUID,
    '340535c6-53f7-4719-b912-b39dfda2b64d'::UUID,
    'c494a15a-137c-4ded-8dbc-0d0ea6c60552'::UUID,
    'c4a3c752-20fe-49b4-bf2c-c0fab9d3e1fb'::UUID,
    'f04bd825-c2c2-494b-978d-c6c00efe9942'::UUID,
    '08be28f3-cba4-4357-aa9e-ed3703cec3c2'::UUID,
    '64680f8e-65af-49f9-8b90-9c8a41abaf50'::UUID,
    'f4e267f6-4892-48ae-8f7f-0dbd472238a4'::UUID,
    'ce916de1-1cbd-4cab-885c-c792db409040'::UUID,
    '349d3be1-b34a-44c9-9ae7-b1cdca519aa7'::UUID,
    'da7f8f59-0356-4428-a39f-301558fd3b10'::UUID,
    '3cd96fc2-2402-4465-84e3-2da36a04ccb1'::UUID,
    'd279b592-f24e-4cfc-af44-6493d2d3a55e'::UUID,
    '09a72b53-fb4c-4b01-806f-f6167d20e303'::UUID,
    '96116c66-1c21-4603-82a5-070df290f3a8'::UUID,
    '4eb43c34-daa6-4607-b948-9d2d8220e0af'::UUID,
    '296331e1-d1fb-46ec-a79d-a7a810cacbec'::UUID,
    'c3ca74f5-bd3d-47b2-ae3b-421203711b02'::UUID,
    '786cf32c-17e7-405c-a1fe-501981499716'::UUID,
    'ce9beeb1-b7e2-4173-be70-5b0c9b1d73da'::UUID
  ];
  v_tt_id UUID;
  i INT;
BEGIN
  -- Create tournament directly in double_elimination phase
  INSERT INTO public.tournaments (id, name, start_date, end_date, current_phase, initial_phase, elimination_type, teams_for_elimination, number_of_fields, number_of_groups, created_by)
  VALUES (v_tournament_id, 'Test DE 24 Équipes', '2026-03-15', '2026-03-16', 'double_elimination', 'round_robin', 'double', 24, 1, 1, v_user_id);

  FOR i IN 1..24 LOOP
    v_tt_id := gen_random_uuid();
    INSERT INTO public.tournament_teams (id, tournament_id, team_id) VALUES (v_tt_id, v_tournament_id, v_teams[i]);
    -- Fake standings: points descending so seed order = i (team at index i is seed i)
    INSERT INTO public.team_stats (tournament_id, team_id, tournament_team_id, points, goals_for, goals_against, wins, losses, draws)
    VALUES (v_tournament_id, v_teams[i], v_tt_id, 25 - i, 10, 5, 3, 0, 0);
  END LOOP;

  RAISE NOTICE 'Tournament created: %', v_tournament_id;
END $$;
