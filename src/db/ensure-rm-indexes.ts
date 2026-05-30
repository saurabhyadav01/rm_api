import { pool } from "./mysql";
import type { RowDataPacket } from "mysql2/promise";

/** RM API query patterns — keep in sync with sql/rm_api_performance_indexes.sql */
const RM_INDEXES: { table: string; name: string; columns: string }[] = [
  { table: "stores", name: "idx_stores_rm_deleted_id", columns: "regional_manager_id, is_deleted, id" },
  { table: "stores", name: "idx_stores_rm_store_code_deleted", columns: "store_code, is_deleted" },
  { table: "store_credentials", name: "idx_store_credentials_store_id", columns: "store_id" },
  {
    table: "store_addresses",
    name: "idx_store_addresses_store_default",
    columns: "store_id, is_default, is_deleted",
  },
  { table: "store_operating_hours", name: "idx_store_operating_hours_store_day", columns: "store_id, day_of_week" },
  { table: "store_payment_methods", name: "idx_store_payment_methods_store_primary", columns: "store_id, is_primary" },
  { table: "products", name: "idx_products_store_deleted_id", columns: "store_id, is_deleted, id" },
  { table: "products", name: "idx_products_store_loose_deleted", columns: "store_id, is_loose_product, is_deleted" },
  {
    table: "product_variants",
    name: "idx_product_variants_product_deleted",
    columns: "product_id, is_deleted, deleted_at",
  },
  { table: "product_pricing", name: "idx_product_pricing_variant_active", columns: "variant_id, is_active" },
  { table: "product_inventory", name: "idx_product_inventory_variant", columns: "variant_id" },
  {
    table: "product_category_mappings",
    name: "idx_pcm_product_status_primary",
    columns: "product_id, status, is_primary",
  },
  {
    table: "product_images",
    name: "idx_product_images_product_active_order",
    columns: "product_id, is_active, display_order",
  },
  { table: "tbl_product", name: "idx_tbl_product_store_deleted_id", columns: "store_id, is_delete, id" },
  {
    table: "tbl_product",
    name: "idx_tbl_product_store_loose_deleted",
    columns: "store_id, loose_product, is_delete",
  },
  {
    table: "tbl_product_attribute",
    name: "idx_tbl_product_attribute_store_product",
    columns: "store_id, product_id",
  },
  { table: "service_details", name: "idx_service_details_rm_deleted", columns: "rm_id, is_delete" },
  { table: "relationship_managers", name: "idx_relationship_managers_phone", columns: "phone" },
  { table: "relationship_managers", name: "idx_relationship_managers_rm_id", columns: "rm_id" },
  { table: "non_onboarded_store", name: "idx_non_onboarded_store_rm_deleted", columns: "rm_id, is_deleted, id" },
  { table: "rm_store_checkout", name: "idx_rm_store_checkout_rm_store", columns: "rm_id, store_id" },
];

let ensured = false;
let ensuring: Promise<void> | null = null;

async function createIndexSafe(table: string, name: string, columns: string): Promise<void> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      `,
      [table, name],
    );
    if (Number(rows?.[0]?.c ?? 0) > 0) return;

    const [tableRows] = await pool.query<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS c
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      `,
      [table],
    );
    if (Number(tableRows?.[0]?.c ?? 0) === 0) return;

    await pool.query(`CREATE INDEX \`${name}\` ON \`${table}\` (${columns})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Duplicate key name|1061|doesn't exist|Unknown table|1146|1054|Unknown column/i.test(msg)) {
      return;
    }
    console.warn(`[rm-indexes] skip ${table}.${name}: ${msg}`);
  }
}

/** Creates missing RM API indexes once per process (non-blocking for missing legacy tables). */
export async function ensureRmIndexes(): Promise<void> {
  if (ensured) return;
  if (ensuring) return ensuring;

  ensuring = (async () => {
    for (const idx of RM_INDEXES) {
      await createIndexSafe(idx.table, idx.name, idx.columns);
    }
    ensured = true;
    console.log(`[rm-indexes] ensured ${RM_INDEXES.length} indexes`);
  })();

  return ensuring;
}
