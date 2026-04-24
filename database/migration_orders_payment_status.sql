-- Ejecutar una vez en bases ya creadas (antes sin estas columnas).
ALTER TABLE orders
  ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' COMMENT 'unpaid|paid|refunded' AFTER payment_method_label,
  ADD COLUMN paid_at DATETIME NULL DEFAULT NULL AFTER payment_status;
