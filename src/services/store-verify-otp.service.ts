import { pool } from "../db/mysql";
import { signStoreOtpToken } from "./jwt.service";
import { type RowDataPacket } from "mysql2/promise";

export type StoreVerifyOtpInput = {
  mobile: string;
  otp: string;
  store_id?: unknown;
  ccode?: string;
  updatedtoken?: unknown;
};

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type OtpRow = RowDataPacket & {
  otp: string | null;
  status: number | string | null;
};

type SettingRow = RowDataPacket & { currency: string | null };

function fail(code: string, msg: string): ServiceResult {
  return {
    httpStatus: 200,
    body: {
      ResponseCode: code,
      Result: "false",
      ResponseMsg: msg,
    },
  };
}

async function fetchCurrency(): Promise<string> {
  try {
    const [rows] = await pool.query<SettingRow[]>(`SELECT currency FROM tbl_setting LIMIT 1`);
    const cur = rows?.[0]?.currency;
    if (cur && String(cur).trim()) return String(cur).trim();
  } catch {
    // table may not exist on v2-only DB
  }
  return "₹";
}

async function getOtpRow(mobile: string): Promise<OtpRow | null> {
  const [rows] = await pool.query<OtpRow[]>(
    `SELECT otp, status FROM tbl_store_otp_verify WHERE mobile = :mobile LIMIT 1`,
    { mobile } as any,
  );
  return rows?.[0] ?? null;
}

async function markOtpUsed(mobile: string, otp: string): Promise<boolean> {
  const [result] = await pool.query(
    `
    UPDATE tbl_store_otp_verify
    SET otp = '0', status = 1
    WHERE mobile = :mobile AND otp = :otp AND status = 0
    `,
    { mobile, otp } as any,
  );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

async function forceClearOtp(mobile: string): Promise<void> {
  await pool.query(
    `UPDATE tbl_store_otp_verify SET otp = '0', status = 1 WHERE mobile = :mobile`,
    { mobile } as any,
  );
}

async function ensureOtpCleared(mobile: string): Promise<void> {
  const row = await getOtpRow(mobile);
  if (!row) return;
  const stored = String(row.otp ?? "").trim();
  const status = String(row.status ?? "");
  if ((stored !== "0" && stored !== "") || status !== "1") {
    await forceClearOtp(mobile);
  }
}

export async function storeVerifyOtpService(input: StoreVerifyOtpInput): Promise<ServiceResult> {
  const mobile = String(input.mobile ?? "").trim();
  const otp = String(input.otp ?? "").trim();

  if (!mobile || !otp) {
    return fail("401", "Mobile number and OTP are required!");
  }

  if (!/^[0-9]{10}$/.test(mobile)) {
    return fail("401", "Invalid mobile number format!");
  }

  if (!/^[0-9]{6}$/.test(otp)) {
    return fail("401", "Invalid OTP! OTP must be exactly 6 digits (numeric only).");
  }

  try {
    const otpRow = await getOtpRow(mobile);
    if (!otpRow) {
      return fail("404", "OTP not found! Please request a new OTP.");
    }

    const storedOtp = String(otpRow.otp ?? "").trim();
    const otpStatus = otpRow.status;

    if (String(otpStatus) === "1") {
      return fail("401", "This OTP has already been used!");
    }

    if (!storedOtp || storedOtp === "0") {
      return fail("401", "This OTP has already been used!");
    }

    if (otp !== storedOtp) {
      await pool.query(`UPDATE tbl_store_otp_verify SET status = 0 WHERE mobile = :mobile`, { mobile } as any);
      return fail("401", "Invalid OTP. Please try again!");
    }

    const updated = await markOtpUsed(mobile, otp);
    if (!updated) {
      return fail("401", "This OTP has already been used! Please request a new OTP.");
    }

    await forceClearOtp(mobile);
    await ensureOtpCleared(mobile);

    const currency = await fetchCurrency();
    const token = signStoreOtpToken(mobile);

    const storeIdRaw = input.store_id;
    const storeId =
      storeIdRaw !== undefined && storeIdRaw !== null && String(storeIdRaw).trim() !== ""
        ? Number(storeIdRaw)
        : null;

    return {
      httpStatus: 200,
      body: {
        StoreLogin: {
          id: Number.isFinite(storeId) ? storeId : null,
          mobile,
          is_verified: 1,
        },
        currency,
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: "OTP verified successfully! Mobile number verified.",
        token,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("tbl_store_otp_verify")) {
      return fail("500", "OTP storage is not available. Ensure tbl_store_otp_verify exists.");
    }
    return fail("500", `Database error: ${msg}`);
  }
}
