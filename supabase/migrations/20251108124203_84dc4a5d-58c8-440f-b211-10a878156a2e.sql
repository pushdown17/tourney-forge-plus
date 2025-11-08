-- Ajouter les valeurs single_elimination et double_elimination à l'enum tournament_phase
ALTER TYPE tournament_phase ADD VALUE IF NOT EXISTS 'single_elimination';
ALTER TYPE tournament_phase ADD VALUE IF NOT EXISTS 'double_elimination';