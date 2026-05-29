import { pool } from "../db/mysql";
import { type RowDataPacket } from "mysql2/promise";

type FranchiseeRow = RowDataPacket & {
  ra_id: string | null;
};

export async function findRaIdByFranchiseeId(franchiseeId: string | null): Promise<string | null> {
  if (!franchiseeId) return null;
  const [rows] = await pool.query<FranchiseeRow[]>(
    `
    SELECT ra_id
    FROM franchisee_master
    WHERE franchisee_id = :franchiseeId
    LIMIT 1
    `,
    { franchiseeId },
  );
  return rows[0]?.ra_id ?? null;
}

