-- Theft register (HTG + ATC)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
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
  unit_price DECIMAL(12,2) NULL,
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
