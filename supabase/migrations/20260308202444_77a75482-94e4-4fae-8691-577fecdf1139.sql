-- Delete wrong L-R1 matches (Lima vs Hotel and Juliet vs Kilo)
DELETE FROM matches 
WHERE id IN ('f06ea9c4-699b-432c-a34e-8ac25d76a956', '47b15177-1748-42bc-bfb4-92eb8742ada8');

-- Insert correct L-R1 matches with cross pairing:
-- L-R1 M1: Hotel (#8, loser of W-R1 M1) vs Juliet (#10, loser of W-R1 M4)
-- L-R1 M2: Lima (#12, loser of W-R1 M2) vs Kilo (#11, loser of W-R1 M3)
INSERT INTO matches (tournament_id, phase, round_number, team1_id, team2_id, is_third_place_match, field_number)
VALUES 
  ('24449eec-9cf0-4623-9ff5-8b25a542e0a5', 'double_elimination', 1, 
   'b63be338-b820-4f43-99d6-7e0135acc236',  -- Hotel
   'f7d272a7-6f58-4eca-8809-bf156a7e1658',  -- Juliet
   true, 1),
  ('24449eec-9cf0-4623-9ff5-8b25a542e0a5', 'double_elimination', 1,
   '62ce9909-dad6-402c-a401-dcf9ae275d34',  -- Lima
   '9189c9fc-cb6a-4c47-926e-147060999814',  -- Kilo
   true, 2);