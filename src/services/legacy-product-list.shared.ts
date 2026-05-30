import { pool } from "../db/mysql";
import { type RowDataPacket } from "mysql2/promise";

type CategoryRow = RowDataPacket & { id: number; title?: string | null; name?: string | null };
type AttrRow = RowDataPacket & Record<string, unknown>;

/** Batch legacy category titles for product list/search. */
export async function fetchLegacyCategoryNameMap(catIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [...new Set(catIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return map;

  const [rows] = await pool.query<CategoryRow[]>(
    `SELECT id, title FROM tbl_category WHERE id IN (${ids.join(",")})`,
  );
  for (const row of rows ?? []) {
    const title = row.title ? String(row.title).trim() : "";
    if (title) map.set(Number(row.id), title);
  }
  return map;
}

/** Batch legacy subcategory names. */
export async function fetchLegacySubCategoryNameMap(subCatIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [...new Set(subCatIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return map;

  const [rows] = await pool.query<CategoryRow[]>(
    `SELECT id, name FROM tbl_product_category WHERE id IN (${ids.join(",")})`,
  );
  for (const row of rows ?? []) {
    const name = row.name ? String(row.name).trim() : "";
    if (name) map.set(Number(row.id), name);
  }
  return map;
}

/** Batch legacy attributes for store product list/search. */
export async function fetchLegacyAttributesMap(
  storeId: number,
  productIds: number[],
  opts?: { activeOnly?: boolean },
): Promise<Map<number, AttrRow[]>> {
  const map = new Map<number, AttrRow[]>();
  const ids = productIds.map((id) => Number(id)).filter((id) => id > 0);
  if (!ids.length) return map;

  const statusFilter = opts?.activeOnly ? "AND status = 1" : "";
  const [rows] = await pool.query<AttrRow[]>(
    `
    SELECT *
    FROM tbl_product_attribute
    WHERE store_id = :store_id
      AND product_id IN (${ids.join(",")})
      AND COALESCE(is_deleted, 0) = 0
      AND (deleted_at IS NULL)
      ${statusFilter}
    ORDER BY product_id ASC, id DESC
    `,
    { store_id: storeId } as any,
  );

  for (const row of rows ?? []) {
    const pid = Number(row.product_id);
    const list = map.get(pid) ?? [];
    list.push(row);
    map.set(pid, list);
  }
  return map;
}
