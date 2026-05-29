import { pool } from "../db/mysql";
import { type ResultSetHeader } from "mysql2/promise";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export async function productsSoftDeleteService(data: any): Promise<Record<string, unknown>> {
  const rm_id = data && typeof data === "object" ? s(data.rm_id) : "";
  const store_id = data && typeof data === "object" ? s(data.store_id) : "";
  const product_id = data && typeof data === "object" ? s(data.product_id) : "";

  if (!rm_id || !store_id || !product_id) {
    return {
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "rm_id, store_id, and product_id are required",
    };
  }

  // Check if product exists for this store and is not already deleted
  const [rows] = await pool.query<any[]>(
    `
    SELECT id
    FROM tbl_product
    WHERE id = :product_id
      AND store_id = :store_id
      AND is_delete = 0
    LIMIT 1
    `,
    { product_id, store_id } as any,
  );

  if (!rows || rows.length === 0) {
    return {
      ResponseCode: "404",
      Result: "false",
      ResponseMsg: "Product not found or doesn't belong to this store",
    };
  }

  try {
    const [upd] = await pool.query<ResultSetHeader>(
      `
      UPDATE tbl_product
      SET status = 0, is_delete = 1
      WHERE id = :product_id
        AND store_id = :store_id
      `,
      { product_id, store_id } as any,
    );

    if (!upd.affectedRows) {
      return {
        ResponseCode: "500",
        Result: "false",
        ResponseMsg: "Failed to update product status",
      };
    }

    // Log the deletion
    await pool.query(
      `
      INSERT INTO tbl_delete_product_log (rm_id, store_id, product_id)
      VALUES (:rm_id, :store_id, :product_id)
      `,
      { rm_id, store_id, product_id } as any,
    );

    return {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Product Soft Deleted Successfully",
    };
  } catch {
    return {
      ResponseCode: "500",
      Result: "false",
      ResponseMsg: "Failed to update product status",
    };
  }
}

