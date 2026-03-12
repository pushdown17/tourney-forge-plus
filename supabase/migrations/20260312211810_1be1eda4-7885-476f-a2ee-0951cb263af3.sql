
-- Delete ALL corrupt R2 duplicate matches (keep only the 4 original sentinels/assigned QF)
-- Keep: 4296fc40 (fn=1 Alfa vs Hotel), b3bf3461 (fn=2 Delta vs Echo), ff25e9e8 (fn=3 Bravo vs Golf), 2b08fa29 (fn=4 Charlie vs Foxtrot)
-- Delete: b412fe76 (fn=2 Golf vs Foxtrot - false), 6e14670f (fn=5 Hotel vs Echo - false)
DELETE FROM matches WHERE id IN ('b412fe76-ba39-4993-b297-1db54899a253', '6e14670f-5f1e-4ce1-baea-45353f632530');

-- Also clean up the Losers bracket false match (Kilo vs Juliet - prelim losers shouldn't be in LB)
DELETE FROM matches WHERE id = '6fad8b6a-c45f-4304-98da-7fec705b366d';

-- Fix fn=3 sentinel: Bravo vs Golf is correct (Golf won R1 fn=3) - already good
-- Fix fn=4 sentinel: Charlie vs Foxtrot is correct (Foxtrot won R1 fn=4) - already good
