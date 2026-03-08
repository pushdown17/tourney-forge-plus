-- Supprimer les mauvais matchs Losers R1 créés avec la logique incorrecte
DELETE FROM matches 
WHERE tournament_id = '3848a42d-7c1a-4b3a-aade-627f426af16e'
  AND phase = 'double_elimination'
  AND is_third_place_match = true
  AND round_number = 1;