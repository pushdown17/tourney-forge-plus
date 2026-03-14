
-- Insert bracket for 24-team DE tournament (bypassing RLS)
-- Seeds 1-8 get BYE (locked in R2 sentinels), Seeds 9-24 play R1 prelims
-- Seeding based on getStandardSeedingPairs(32) grouped into 8 R2 slots

DO $$
DECLARE
  tid UUID := '036f75ee-dd25-46de-8f3a-692fc9f42f1a';
  -- Seeds ordered by rank (index = seed-1)
  seeds UUID[] := ARRAY[
    '6348661e-44da-48f5-be5b-9554cdd73a7e', -- 1 Gulls
    '1802359d-0ea3-41c7-978d-436f9759c60d', -- 2 Chevals
    'a4d039f3-1b68-47d5-9176-585c3b373ce9', -- 3 Pantheon
    '8320ec28-57f3-4234-ab12-0e60db7f985d', -- 4 Morning Star
    '8f79b8fe-7060-4b3c-916e-0d76e26e84a2', -- 5 Saladidier
    '340535c6-53f7-4719-b912-b39dfda2b64d', -- 6 Harry Cover
    'c494a15a-137c-4ded-8dbc-0d0ea6c60552', -- 7 Bella
    'c4a3c752-20fe-49b4-bf2c-c0fab9d3e1fb', -- 8 Yoyoli Binni
    'f04bd825-c2c2-494b-978d-c6c00efe9942', -- 9 Albatar
    '08be28f3-cba4-4357-aa9e-ed3703cec3c2', -- 10 Vanguard
    '64680f8e-65af-49f9-8b90-9c8a41abaf50', -- 11 Nebula
    'f4e267f6-4892-48ae-8f7f-0dbd472238a4', -- 12 Arte
    'ce916de1-1cbd-4cab-885c-c792db409040', -- 13 Lizard
    '349d3be1-b34a-44c9-9ae7-b1cdca519aa7', -- 14 Lovely
    'da7f8f59-0356-4428-a39f-301558fd3b10', -- 15 Les Odieux
    '3cd96fc2-2402-4465-84e3-2da36a04ccb1', -- 16 Les Remorques
    'd279b592-f24e-4cfc-af44-6493d2d3a55e', -- 17 Triple Booster
    '09a72b53-fb4c-4b01-806f-f6167d20e303', -- 18 Les Hypers
    '96116c66-1c21-4603-82a5-070df290f3a8', -- 19 Impatience
    '4eb43c34-daa6-4607-b948-9d2d8220e0af', -- 20 Coude Coeur
    '296331e1-d1fb-46ec-a79d-a7a810cacbec', -- 21 Lasagnes saumon
    'c3ca74f5-bd3d-47b2-ae3b-421203711b02', -- 22 2B3
    '786cf32c-17e7-405c-a1fe-501981499716', -- 23 Au Pif
    'ce9beeb1-b7e2-4173-be70-5b0c9b1d73da'  -- 24 Pistax
  ];
BEGIN
  -- R1 Preliminary matches (8 matches: seeds 9-24 play, 1-8 get BYE)
  -- Slot 1: seed16 vs seed17, BYE=seed1
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',1,seeds[16],seeds[17],1,false);
  -- Slot 2: seed9 vs seed24, BYE=seed8
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',1,seeds[9],seeds[24],2,false);
  -- Slot 3: seed12 vs seed21, BYE=seed5
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',1,seeds[12],seeds[21],3,false);
  -- Slot 4: seed13 vs seed20, BYE=seed4
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',1,seeds[13],seeds[20],4,false);
  -- Slot 5: seed14 vs seed19, BYE=seed3
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',1,seeds[14],seeds[19],5,false);
  -- Slot 6: seed11 vs seed22, BYE=seed6
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',1,seeds[11],seeds[22],6,false);
  -- Slot 7: seed10 vs seed23, BYE=seed7
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',1,seeds[10],seeds[23],7,false);
  -- Slot 8: seed15 vs seed18, BYE=seed2
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',1,seeds[15],seeds[18],8,false);

  -- R2 Sentinel matches (8 sentinels: BYE seed locked in team1=team2)
  -- Slot 1: seed1 BYE (sentinel = team1=team2=seed1)
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',2,seeds[1],seeds[1],1,false);
  -- Slot 2: seed8 BYE
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',2,seeds[8],seeds[8],2,false);
  -- Slot 3: seed5 BYE
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',2,seeds[5],seeds[5],3,false);
  -- Slot 4: seed4 BYE
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',2,seeds[4],seeds[4],4,false);
  -- Slot 5: seed3 BYE
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',2,seeds[3],seeds[3],5,false);
  -- Slot 6: seed6 BYE
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',2,seeds[6],seeds[6],6,false);
  -- Slot 7: seed7 BYE
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',2,seeds[7],seeds[7],7,false);
  -- Slot 8: seed2 BYE
  INSERT INTO public.matches (tournament_id,phase,round_number,team1_id,team2_id,field_number,is_third_place_match)
  VALUES (tid,'double_elimination',2,seeds[2],seeds[2],8,false);

  RAISE NOTICE 'Bracket inserted for tournament %', tid;
END $$;
