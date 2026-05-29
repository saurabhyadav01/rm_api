import { pool } from "../db/mysql";
import { type RelationshipManager } from "../models/relationship-manager.model";
import { type RowDataPacket } from "mysql2/promise";

type RmRow = RowDataPacket & RelationshipManager;

const RM_COLUMNS = `
  id,
  user_id,
  rm_id,
  franchisee_id,
  name,
  father_name,
  date_of_birth,
  gender,
  photo,
  phone,
  email,
  address,
  wallet_balance,
  wallet_status,
  status
`;

/** Active, non-deleted rows from relationship_managers. */
const RM_ACTIVE_WHERE = `
  status = 'active'
  AND deleted_at IS NULL
`;

export async function findActiveRmByPhone(phone: string): Promise<RelationshipManager | null> {
  const [rows] = await pool.query<RmRow[]>(
    `
    SELECT ${RM_COLUMNS}
    FROM relationship_managers
    WHERE phone = :phone
      AND ${RM_ACTIVE_WHERE}
    LIMIT 1
    `,
    { phone: phone.trim() },
  );

  return rows[0] ?? null;
}

export async function findActiveRmByLoginId(loginId: string): Promise<RelationshipManager | null> {
  const value = loginId.trim();
  const [rows] = await pool.query<RmRow[]>(
    `
    SELECT ${RM_COLUMNS}
    FROM relationship_managers
    WHERE (rm_id = :value OR email = :value OR phone = :value)
      AND ${RM_ACTIVE_WHERE}
    LIMIT 1
    `,
    { value },
  );

  return rows[0] ?? null;
}
