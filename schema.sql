-- Theft register (HTG + ATC)
-- Full current schema, with migrations/001-006 already baked in. `npm run migrate`
-- seeds schema_migrations below so it no-ops on a DB bootstrapped from this file,
-- but still applies any migration added after this file was last regenerated.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS thefts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project ENUM('HTG','ATC') NOT NULL,
  post_date DATE NOT NULL,
  theft_date DATE NULL,
  site_id VARCHAR(20) NULL,
  site_name VARCHAR(100) NULL,
  last_visit_date DATE NULL,
  item_stolen VARCHAR(150) NOT NULL,
  item_type VARCHAR(40) NOT NULL,
  unit VARCHAR(5) NOT NULL,
  length VARCHAR(20) NULL,
  rh_before DECIMAL(10,2) NULL,
  rh_after DECIMAL(10,2) NULL,
  dipstick_before_cm DECIMAL(6,2) NULL,
  dipstick_after_cm DECIMAL(6,2) NULL,
  probe_before_l DECIMAL(8,2) NULL,
  probe_after_l DECIMAL(8,2) NULL,
  fuel_before_l DECIMAL(8,2) NULL,
  fuel_after_l DECIMAL(8,2) NULL,
  quantity_lost DECIMAL(10,2) NULL,
  quantity_override TINYINT(1) NOT NULL DEFAULT 0,
  quantity_ned DECIMAL(10,2) NULL,
  quantity_ned_override TINYINT(1) NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,2) NULL,
  price_override TINYINT(1) NOT NULL DEFAULT 0,
  posted_by VARCHAR(60) NULL,
  source_time VARCHAR(80) NULL,
  source_msg_ids VARCHAR(120) NOT NULL,
  flags VARCHAR(200) NULL,
  remarks TEXT NULL,
  raw_post MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source_item (project, source_msg_ids, item_stolen),
  KEY idx_post_date (post_date),
  KEY idx_site (site_id),
  KEY idx_item_type (item_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(30) NULL,
  entity_id VARCHAR(40) NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  meta JSON NULL,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_created (created_at), KEY idx_user (user_id), KEY idx_action (action),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO schema_migrations (name) VALUES
  ('001_price_override.sql'),
  ('002_admin.sql'),
  ('003_audit_log.sql'),
  ('004_quantity_override.sql'),
  ('005_quantity_ned.sql'),
  ('006_quantity_ned_override.sql');
