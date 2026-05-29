import { pool } from "../db/mysql";
import { type RelationshipManager } from "../models/relationship-manager.model";
import { normalizePhoneInput } from "../utils/phone";
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

/** Active, non-deleted rows (matches panel: deleted_at IS NULL). */
const RM_ACTIVE_WHERE = `
  status = 'active'
  AND deleted_at IS NULL
`;

function phoneMatchSql(alias = "phone"): string {
  return `
  (
    ${alias} = :raw
    OR ${alias} = :digits
    OR ${alias} = :last10
    OR ${alias} = CONCAT('91', :last10)
    OR ${alias} = CONCAT('+91', :last10)
    OR REPLACE(REPLACE(REPLACE(${alias}, '+', ''), '-', ''), ' ', '') = :digits
    OR RIGHT(REPLACE(REPLACE(REPLACE(${alias}, '+', ''), '-', ''), ' ', ''), 10) = :last10
  )`;
}

export async function findActiveRmByPhone(phone: string): Promise<RelationshipManager | null> {
  const { raw, digits, last10 } = normalizePhoneInput(phone);

  const [rows] = await pool.query<RmRow[]>(
    `
    SELECT ${RM_COLUMNS}
    FROM relationship_managers
    WHERE ${phoneMatchSql("phone")}
      AND ${RM_ACTIVE_WHERE}
    LIMIT 1
    `,
    { raw, digits, last10 },
  );

  return rows[0] ?? null;
}

export async function findActiveRmByLoginId(loginId: string): Promise<RelationshipManager | null> {
  const value = loginId.trim();
  const { raw, digits, last10 } = normalizePhoneInput(value);

  const [rows] = await pool.query<RmRow[]>(
    `
    SELECT ${RM_COLUMNS}
    FROM relationship_managers
    WHERE (
        rm_id = :value
        OR email = :value
        OR ${phoneMatchSql("phone")}
      )
      AND ${RM_ACTIVE_WHERE}
    LIMIT 1
    `,
    { value, raw, digits, last10 },
  );

  return rows[0] ?? null;
}
