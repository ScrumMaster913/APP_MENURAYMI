-- Inti Raymi / OLACLIC — esquema MySQL 8+ (utf8mb4)
-- Ejecutar una vez en Hostinger (phpMyAdmin → SQL) o: mysql -u USER -p DB < database/schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS order_lines;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS product_modifier_links;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS modifier_options;
DROP TABLE IF EXISTS modifier_groups;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS checkout_payment_methods;
DROP TABLE IF EXISTS restaurant;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE restaurant (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  currency_symbol VARCHAR(8) NOT NULL DEFAULT '$',
  logo_url VARCHAR(600) NOT NULL DEFAULT '',
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO restaurant (id, currency_symbol, logo_url) VALUES (1, '$', '');

CREATE TABLE categories (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0,
  name VARCHAR(255) NOT NULL,
  layout VARCHAR(16) NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  category_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  image_url VARCHAR(600) NULL,
  sku VARCHAR(80) NULL,
  kitchen VARCHAR(80) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'available',
  pricing_mode VARCHAR(16) NULL DEFAULT NULL,
  base_price INT NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NULL,
  cost DECIMAL(12,2) NULL,
  packaging DECIMAL(12,2) NULL,
  stock_enabled TINYINT(1) NOT NULL DEFAULT 0,
  stock INT NULL,
  min_stock INT NULL,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE ON UPDATE CASCADE,
  KEY idx_products_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  name VARCHAR(120) NOT NULL,
  price INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_pv_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
  KEY idx_pv_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE modifier_groups (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  product_id VARCHAR(80) NULL DEFAULT NULL,
  library_sort INT NULL DEFAULT NULL,
  inline_sort INT NULL DEFAULT NULL,
  name VARCHAR(150) NOT NULL,
  optional TINYINT(1) NOT NULL DEFAULT 0,
  multi_select TINYINT(1) NOT NULL DEFAULT 1,
  min_select SMALLINT NOT NULL DEFAULT 0,
  max_select SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_modg_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
  KEY idx_modg_product (product_id),
  KEY idx_modg_library (library_sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE modifier_options (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  group_id VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  name VARCHAR(120) NOT NULL,
  price INT NOT NULL DEFAULT 0,
  max_qty SMALLINT NOT NULL DEFAULT 99,
  cost DECIMAL(12,2) NULL,
  discount DECIMAL(12,2) NULL,
  sku VARCHAR(80) NULL,
  status VARCHAR(16) NULL DEFAULT NULL,
  CONSTRAINT fk_mo_group FOREIGN KEY (group_id) REFERENCES modifier_groups (id) ON DELETE CASCADE ON UPDATE CASCADE,
  KEY idx_mo_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_modifier_links (
  product_id VARCHAR(80) NOT NULL,
  modifier_group_id VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, modifier_group_id),
  CONSTRAINT fk_pml_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pml_group FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE checkout_payment_methods (
  slug VARCHAR(40) NOT NULL PRIMARY KEY,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  label VARCHAR(80) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  instructions VARCHAR(800) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO checkout_payment_methods (slug, sort_order, label, enabled, instructions) VALUES
('efectivo', 1, 'Efectivo', 1, ''),
('pago_online', 2, 'Pago Online', 1, ''),
('transferencia', 3, 'Transferencia', 1, ''),
('pluxee_sodexo', 4, 'Pluxee (Sodexo)', 1, ''),
('ticket_edenred', 5, 'Ticket Restaurant (Edenred)', 1, ''),
('tarjeta', 6, 'Tarjeta', 1, '');

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(12) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  service_type VARCHAR(40) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'confirmed',
  subtotal_clp INT NOT NULL DEFAULT 0,
  total_clp INT NOT NULL DEFAULT 0,
  delivery_name VARCHAR(200) NULL,
  delivery_phone VARCHAR(64) NULL,
  delivery_address_json JSON NULL,
  delivery_address_label TEXT NULL,
  customer_comment TEXT NULL,
  coupon VARCHAR(160) NULL,
  payment_method_slug VARCHAR(40) NULL,
  payment_method_label VARCHAR(120) NULL,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' COMMENT 'unpaid|paid|refunded',
  paid_at DATETIME NULL DEFAULT NULL,
  cash_tender_clp INT NULL,
  change_clp INT NULL,
  order_message MEDIUMTEXT NULL,
  UNIQUE KEY uq_orders_public (public_id),
  KEY idx_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  product_id VARCHAR(80) NULL,
  product_name VARCHAR(255) NOT NULL,
  variant_name VARCHAR(160) NULL,
  qty INT NOT NULL DEFAULT 1,
  unit_price_clp INT NOT NULL DEFAULT 0,
  line_total_clp INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  modifiers_json JSON NULL,
  CONSTRAINT fk_ol_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE ON UPDATE CASCADE,
  KEY idx_ol_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
