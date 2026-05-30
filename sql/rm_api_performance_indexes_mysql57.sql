-- RM API performance indexes — MySQL 5.7 / MariaDB compatible (no IF NOT EXISTS).
-- Replace `hellchotunewapi` with your DB name, then run in mysql client.
-- Safe to re-run: skips indexes/tables that already exist.

USE hellchotunewapi;

DROP PROCEDURE IF EXISTS sp_rm_add_index_if_missing;

DELIMITER $$

CREATE PROCEDURE sp_rm_add_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_columns VARCHAR(512)
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = p_table
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = p_table
      AND index_name = p_index
  ) THEN
    SET @sql = CONCAT(
      'CREATE INDEX `', p_index, '` ON `', p_table, '` (', p_columns, ')'
    );
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- Stores (RM list / search)
CALL sp_rm_add_index_if_missing('stores', 'idx_stores_rm_deleted_id', 'regional_manager_id, is_deleted, id');
CALL sp_rm_add_index_if_missing('stores', 'idx_stores_rm_store_code_deleted', 'store_code, is_deleted');

-- Store child tables
CALL sp_rm_add_index_if_missing('store_credentials', 'idx_store_credentials_store_id', 'store_id');
CALL sp_rm_add_index_if_missing('store_addresses', 'idx_store_addresses_store_default', 'store_id, is_default, is_deleted');
CALL sp_rm_add_index_if_missing('store_operating_hours', 'idx_store_operating_hours_store_day', 'store_id, day_of_week');
CALL sp_rm_add_index_if_missing('store_payment_methods', 'idx_store_payment_methods_store_primary', 'store_id, is_primary');

-- Products v2 (you use v2 schema)
CALL sp_rm_add_index_if_missing('products', 'idx_products_store_deleted_id', 'store_id, is_deleted, id');
CALL sp_rm_add_index_if_missing('products', 'idx_products_store_loose_deleted', 'store_id, is_loose_product, is_deleted');
CALL sp_rm_add_index_if_missing('product_variants', 'idx_product_variants_product_deleted', 'product_id, is_deleted, deleted_at');
CALL sp_rm_add_index_if_missing('product_pricing', 'idx_product_pricing_variant_active', 'variant_id, is_active');
CALL sp_rm_add_index_if_missing('product_inventory', 'idx_product_inventory_variant', 'variant_id');
CALL sp_rm_add_index_if_missing('product_category_mappings', 'idx_pcm_product_status_primary', 'product_id, status, is_primary');
CALL sp_rm_add_index_if_missing('product_images', 'idx_product_images_product_active_order', 'product_id, is_active, display_order');

-- Legacy (skip if table missing — procedure handles it)
CALL sp_rm_add_index_if_missing('tbl_product', 'idx_tbl_product_store_deleted_id', 'store_id, is_delete, id');
CALL sp_rm_add_index_if_missing('tbl_product', 'idx_tbl_product_store_loose_deleted', 'store_id, loose_product, is_delete');
CALL sp_rm_add_index_if_missing('tbl_product_attribute', 'idx_tbl_product_attribute_store_product', 'store_id, product_id');
CALL sp_rm_add_index_if_missing('service_details', 'idx_service_details_rm_deleted', 'rm_id, is_delete');

-- RM auth / onboarding / checkout
CALL sp_rm_add_index_if_missing('relationship_managers', 'idx_relationship_managers_phone', 'phone');
CALL sp_rm_add_index_if_missing('relationship_managers', 'idx_relationship_managers_rm_id', 'rm_id');
CALL sp_rm_add_index_if_missing('non_onboarded_store', 'idx_non_onboarded_store_rm_deleted', 'rm_id, is_deleted, id');
CALL sp_rm_add_index_if_missing('rm_store_checkout', 'idx_rm_store_checkout_rm_store', 'rm_id, store_id');

DROP PROCEDURE IF EXISTS sp_rm_add_index_if_missing;

-- Verify (optional):
-- SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
-- FROM information_schema.statistics
-- WHERE table_schema = DATABASE()
--   AND index_name LIKE 'idx_%'
-- GROUP BY table_name, index_name
-- ORDER BY table_name, index_name;
