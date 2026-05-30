import { pool } from "./mysql";

let ensured = false;

async function ensureStoreOtpExpiresColumn(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE tbl_store_otp_verify
      ADD COLUMN otp_expires_at datetime NULL DEFAULT NULL
      COMMENT 'UTC expiry (5 min after send)'
      AFTER status
    `);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column|1060/i.test(msg)) throw e;
  }
}

/** Creates `tbl_store_otp_verify` when missing (legacy table dropped in some DBs). */
export async function ensureStoreOtpTable(): Promise<void> {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_store_otp_verify (
      id int NOT NULL AUTO_INCREMENT,
      mobile varchar(20) NOT NULL,
      ccode varchar(10) NOT NULL DEFAULT '+91',
      otp varchar(10) NOT NULL DEFAULT '0',
      status tinyint NOT NULL DEFAULT 0 COMMENT '0=pending OTP, 1=verified/used',
      otp_expires_at datetime NULL DEFAULT NULL COMMENT 'UTC expiry (5 min after send)',
      created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_mobile (mobile)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureStoreOtpExpiresColumn();
  ensured = true;
}
