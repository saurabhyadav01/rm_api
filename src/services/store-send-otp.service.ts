import { pool } from "../db/mysql";
import { ensureStoreOtpTable } from "../db/ensure-store-otp-table";
import { useStoresTable } from "../config/schema";
import { isSmsConfigured, sendStoreOtpSms, SmsSendError } from "./sms.service";
import { type RowDataPacket } from "mysql2/promise";
import { kolkataOtpExpiryMeta, OTP_TTL_SECONDS } from "../utils/kolkata-time";

export type StoreSendOtpInput = {
  mobile: string;
  ccode?: string;
};

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type IdRow = RowDataPacket & { id: number };
type OtpVerifyRow = RowDataPacket & { id?: number; status?: number | string | null };

function mobileDigitsSql(column: string) {
  return `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', ''), '_', ''), 10)`;
}

function normalizeCcode(ccode: unknown) {
  const raw = String(ccode ?? "91").trim();
  const digits = raw.replace(/\D/g, "") || "91";
  return { digits, withPlus: `+${digits}` };
}

function validateMobile(mobile: string): string | null {
  if (!mobile) return "Mobile number is required!";
  if (!/^[0-9]{10}$/.test(mobile)) {
    return "Invalid mobile number! Mobile number must be exactly 10 digits.";
  }
  return null;
}

async function mobileExistsInOnboardedStores(mobile: string): Promise<boolean> {
  const mobileLike = `%${mobile}`;
  const params = { mobile, mobileLike };

  if (useStoresTable()) {
    const digits = mobileDigitsSql("sc.phone_number");
    const [rows] = await pool.query<IdRow[]>(
      `
      SELECT s.id
      FROM stores s
      INNER JOIN store_credentials sc ON sc.store_id = s.id
      WHERE (s.is_deleted = 0 OR s.is_deleted IS NULL)
        AND (
          sc.phone_number = :mobile
          OR sc.phone_number LIKE :mobileLike
          OR ${digits} = :mobile
        )
      LIMIT 1
      `,
      params as any,
    );
    return (rows?.length ?? 0) > 0;
  }

  const digits = mobileDigitsSql("mobile");
  const [rows] = await pool.query<IdRow[]>(
    `
    SELECT id
    FROM service_details
    WHERE mobile = :mobile
      OR mobile LIKE :mobileLike
      OR ${digits} = :mobile
    LIMIT 1
    `,
    params as any,
  );
  return (rows?.length ?? 0) > 0;
}

async function getOtpVerifyRow(mobile: string): Promise<OtpVerifyRow | null> {
  const [rows] = await pool.query<OtpVerifyRow[]>(
    `SELECT id, status FROM tbl_store_otp_verify WHERE mobile = :mobile LIMIT 1`,
    { mobile } as any,
  );
  return rows?.[0] ?? null;
}

async function upsertStoreOtp(mobile: string, ccodeWithPlus: string, otp: string): Promise<boolean> {
  const existing = await getOtpVerifyRow(mobile);
  if (existing?.id) {
    const [result] = await pool.query(
      `
      UPDATE tbl_store_otp_verify
      SET otp = :otp,
          ccode = :ccode,
          status = 0,
          otp_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL :ttl SECOND)
      WHERE mobile = :mobile
      `,
      { otp, ccode: ccodeWithPlus, mobile, ttl: OTP_TTL_SECONDS } as any,
    );
    return (result as { affectedRows?: number }).affectedRows !== 0;
  }

  const [result] = await pool.query(
    `
    INSERT INTO tbl_store_otp_verify (mobile, ccode, otp, status, otp_expires_at)
    VALUES (:mobile, :ccode, :otp, 0, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :ttl SECOND))
    `,
    { mobile, ccode: ccodeWithPlus, otp, ttl: OTP_TTL_SECONDS } as any,
  );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function storeSendOtpService(input: StoreSendOtpInput): Promise<ServiceResult> {
  const mobile = String(input.mobile ?? "").trim();
  const mobileError = validateMobile(mobile);
  if (mobileError) {
    return {
      httpStatus: 200,
      body: {
        ResponseCode: "401",
        Result: "false",
        ResponseMsg: mobileError,
      },
    };
  }

  const { digits: ccodeDigits, withPlus: actualCcode } = normalizeCcode(input.ccode);

  try {
    await ensureStoreOtpTable();

    const exists = await mobileExistsInOnboardedStores(mobile);
    if (exists) {
      return {
        httpStatus: 200,
        body: {
          ResponseCode: "409",
          Result: "false",
          ResponseMsg: "Mobile number already exists. OTP cannot be sent.",
        },
      };
    }

    const verifiedRow = await getOtpVerifyRow(mobile);
    if (verifiedRow && String(verifiedRow.status ?? "") === "1") {
      return {
        httpStatus: 200,
        body: {
          ResponseCode: "200",
          Result: "true",
          ResponseMsg: "Mobile number is already verified!",
          ccode: actualCcode,
          mobile,
          is_verified: true,
        },
      };
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const dbSuccess = await upsertStoreOtp(mobile, actualCcode, otp);

    if (!dbSuccess) {
      return {
        httpStatus: 200,
        body: {
          ResponseCode: "500",
          Result: "false",
          ResponseMsg: "Database operation failed!",
        },
      };
    }

    if (!isSmsConfigured() && process.env.RM_ALLOW_OTP_WITHOUT_SMS !== "true") {
      return {
        httpStatus: 200,
        body: {
          ResponseCode: "500",
          Result: "false",
          ResponseMsg: "Failed to send OTP. Please try again!",
          ccode: actualCcode,
          mobile,
        },
      };
    }

    if (isSmsConfigured()) {
      try {
        await sendStoreOtpSms(mobile, otp, ccodeDigits);
      } catch (e) {
        const msg =
          e instanceof SmsSendError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Failed to send OTP. Please try again!";
        return {
          httpStatus: 200,
          body: {
            ResponseCode: "500",
            Result: "false",
            ResponseMsg: msg.includes("Failed to send") ? msg : "Failed to send OTP. Please try again!",
            ccode: actualCcode,
            mobile,
          },
        };
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn("[rm] store OTP SMS skipped (RM_ALLOW_OTP_WITHOUT_SMS=true)", { mobile, otp });
    }

    const expiry = kolkataOtpExpiryMeta(OTP_TTL_SECONDS);

    return {
      httpStatus: 200,
      body: {
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: "OTP sent successfully to your mobile number! Valid for 5 minutes.",
        ccode: actualCcode,
        mobile,
        expires_in: expiry.expiresInSeconds,
        expires_at: expiry.expires_at,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("tbl_store_otp_verify")) {
      return {
        httpStatus: 200,
        body: {
          ResponseCode: "500",
          Result: "false",
          ResponseMsg: "OTP storage is not available. Ensure tbl_store_otp_verify exists.",
        },
      };
    }
    return {
      httpStatus: 200,
      body: {
        ResponseCode: "500",
        Result: "false",
        ResponseMsg: `Database error: ${msg}`,
      },
    };
  }
}
