import { pool } from "../db/mysql";
import { type RowDataPacket } from "mysql2/promise";

type StoreIdRow = RowDataPacket & { id: number };

function s(v: unknown) {
  return String(v ?? "").trim();
}

/**
 * Resolves mobile/RM store code (e.g. RM20251226024) or numeric id
 * to service_details.id used by products.store_id / tbl_product.store_id.
 */
export async function resolveStoreNumericId(storeIdRaw: unknown): Promise<number | null> {
  const raw = s(storeIdRaw);
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const [byPk] = await pool.query<StoreIdRow[]>(
      "SELECT id FROM service_details WHERE id = :id LIMIT 1",
      { id: n } as any,
    );
    if (byPk?.[0]?.id) return Number(byPk[0].id);
  }

  // Public store code on service_details.store_id (RM… / ST…)
  const [byPublicId] = await pool.query<StoreIdRow[]>(
    `
    SELECT id FROM service_details
    WHERE store_id = :raw
       OR CAST(id AS CHAR) = :raw
    LIMIT 1
    `,
    { raw } as any,
  );
  if (byPublicId?.[0]?.id) return Number(byPublicId[0].id);

  // Newer schema: store_code column (if present)
  try {
    const [byCode] = await pool.query<StoreIdRow[]>(
      "SELECT id FROM service_details WHERE store_code = :raw LIMIT 1",
      { raw } as any,
    );
    if (byCode?.[0]?.id) return Number(byCode[0].id);
  } catch {
    // column may not exist on legacy DB
  }

  // Normalized stores table (if service_details migrated)
  try {
    const [byStores] = await pool.query<StoreIdRow[]>(
      "SELECT id FROM stores WHERE store_code = :raw OR CAST(id AS CHAR) = :raw LIMIT 1",
      { raw } as any,
    );
    if (byStores?.[0]?.id) return Number(byStores[0].id);
  } catch {
    // table may not exist
  }

  return null;
}
