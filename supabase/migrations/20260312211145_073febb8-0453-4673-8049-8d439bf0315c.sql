
-- Delete duplicate R1 match (Lima vs India - ghost match created by error)
DELETE FROM matches WHERE id = 'aa729a36-c402-4528-9d43-c19d7b0aa353';

-- Delete duplicate R2 match (Hotel vs Echo - incorrect match created by old progression logic)
DELETE FROM matches WHERE id = '22c3113b-fabd-458b-b2b1-f00b572a0407';
