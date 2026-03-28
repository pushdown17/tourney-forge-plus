
UPDATE matches SET sort_order = CASE 
  WHEN id = '5c58b30a-dbf2-4ed1-97fe-845626bdf9a5' THEN 0
  WHEN id = '50e77a31-e7fe-4724-b492-d5672080bc09' THEN 1
END
WHERE id IN ('5c58b30a-dbf2-4ed1-97fe-845626bdf9a5', '50e77a31-e7fe-4724-b492-d5672080bc09');
