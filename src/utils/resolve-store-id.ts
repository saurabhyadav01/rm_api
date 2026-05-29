import { pool } from "../db/mysql";
import { useStoresTable } from "../config/schema";
import { type RowDataPacket } from "mysql2/promise";

type StoreIdRow = RowDataPacket & { id: number };

function s(v: unknown) {
  return String(v ?? "").trim();
}

/** hellochotu_microservices `stores` table (production DB). */
async function resolveFromStoresTable(raw: string): Promise<number | null> {
  const params: Record<string, unknown> = { raw };
  let idMatch = "";
  if (/^\d+$/.test(raw)) {
    idMatch = "OR s.id = :numId";
    params.numId = Number(raw);
  }

  const [rows] = await pool.query<StoreIdRow[]>(
    `
    SELECT s.id
    FROM stores s
    WHERE (s.is_deleted = 0 OR s.is_deleted IS NULL)
      AND (
        s.store_code = :raw
        OR CAST(s.id AS CHAR) = :raw
        ${idMatch}
      )
    LIMIT 1
    `,
    params as any,
  );

  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

/** Legacy DB only (RM_SCHEMA_V2=false). */
async function resolveFromServiceDetails(raw: string): Promise<number | null> {
  const params: Record<string, unknown> = { raw };
  let idMatch = "";
  if (/^\d+$/.test(raw)) {
    idMatch = "OR id = :numId";
    params.numId = Number(raw);
  }

  const [rows] = await pool.query<StoreIdRow[]>(
    `
    SELECT id
    FROM service_details
    WHERE store_id = :raw
       OR CAST(id AS CHAR) = :raw
       ${idMatch}
    LIMIT 1
    `,
    params as any,
  );

  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

/**
 * Resolves store code (RM…) or numeric id → `stores.id` (v2) / `service_details.id` (legacy).
 * Used as `products.store_id` foreign key.
 */
export async function resolveStoreNumericId(storeIdRaw: unknown): Promise<number | null> {
  const raw = s(storeIdRaw);
  if (!raw) return null;

  if (useStoresTable()) {
    return resolveFromStoresTable(raw);
  }

  return resolveFromServiceDetails(raw);
}
