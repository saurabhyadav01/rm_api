-- RM API performance indexes (stores list, product list/search, OTP, checkout).
-- Safe to re-run: uses CREATE INDEX IF NOT EXISTS (MySQL 8+).
-- Applied automatically on rm_api startup via ensure-rm-indexes.ts.

-- Stores (RM list / search by regional_manager_id)
CREATE INDEX IF NOT EXISTS idx_stores_rm_deleted_id ON stores (regional_manager_id, is_deleted, id);
CREATE INDEX IF NOT EXISTS idx_stores_rm_store_code_deleted ON stores (store_code, is_deleted);

-- Store child tables (list JOINs)
CREATE INDEX IF NOT EXISTS idx_store_credentials_store_id ON store_credentials (store_id);
CREATE INDEX IF NOT EXISTS idx_store_addresses_store_default ON store_addresses (store_id, is_default, is_deleted);
CREATE INDEX IF NOT EXISTS idx_store_operating_hours_store_day ON store_operating_hours (store_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_store_payment_methods_store_primary ON store_payment_methods (store_id, is_primary);

-- Products v2 (list-with-attributes, search, loose search)
CREATE INDEX IF NOT EXISTS idx_products_store_deleted_id ON products (store_id, is_deleted, id);
CREATE INDEX IF NOT EXISTS idx_products_store_loose_deleted ON products (store_id, is_loose_product, is_deleted);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_deleted ON product_variants (product_id, is_deleted, deleted_at);
CREATE INDEX IF NOT EXISTS idx_product_pricing_variant_active ON product_pricing (variant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_product_inventory_variant ON product_inventory (variant_id);

-- Legacy product tables (RM_SCHEMA_V2=false)
CREATE INDEX IF NOT EXISTS idx_tbl_product_store_deleted_id ON tbl_product (store_id, is_delete, id);
CREATE INDEX IF NOT EXISTS idx_tbl_product_store_loose_deleted ON tbl_product (store_id, loose_product, is_delete);
CREATE INDEX IF NOT EXISTS idx_tbl_product_attribute_store_product ON tbl_product_attribute (store_id, product_id);

-- Legacy stores
CREATE INDEX IF NOT EXISTS idx_service_details_rm_deleted ON service_details (rm_id, is_delete);

-- RM auth / onboarding / checkout
CREATE INDEX IF NOT EXISTS idx_relationship_managers_phone ON relationship_managers (phone);
CREATE INDEX IF NOT EXISTS idx_relationship_managers_rm_id ON relationship_managers (rm_id);
CREATE INDEX IF NOT EXISTS idx_non_onboarded_store_rm_deleted ON non_onboarded_store (rm_id, is_deleted, id);
CREATE INDEX IF NOT EXISTS idx_rm_store_checkout_rm_store ON rm_store_checkout (rm_id, store_id);
