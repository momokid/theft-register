ALTER TABLE thefts ADD COLUMN quantity_override TINYINT(1) NOT NULL DEFAULT 0 AFTER quantity_lost;
