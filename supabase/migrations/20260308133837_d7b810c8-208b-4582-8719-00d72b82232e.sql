-- G vs F : losers de W-R1 M1 (K>G) et M2 (I>F) — pairing consécutif correct
INSERT INTO matches (tournament_id, phase, round_number, team1_id, team2_id, is_third_place_match, field_number)
VALUES (
  '3848a42d-7c1a-4b3a-aade-627f426af16e',
  'double_elimination', 1,
  'd0a51841-b460-48c4-8e13-070cbee757e2', -- G
  '0838ecf6-c45e-42b5-8523-ca07fa71dd1d', -- F
  true, 1
)
ON CONFLICT DO NOTHING;