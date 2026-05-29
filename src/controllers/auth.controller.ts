import { type Request, type Response } from "express";
import { z } from "zod";
import { findActiveRmByLoginId, findActiveRmByPhone } from "../repositories/relationship-manager.repo";
import { findRaIdByFranchiseeId } from "../repositories/franchisee.repo";
import { signRmToken } from "../services/jwt.service";
import { generateOtp, getOtpMeta, verifyOtp } from "../services/otp.service";

function maskPhone(phone: string): string {
  const p = phone.trim();
  if (p.length <= 4) return "*".repeat(p.length);
  const start = p.slice(0, 2);
  const end = p.slice(-2);
  return `${start}${"*".repeat(Math.max(0, p.length - 4))}${end}`;
}

function send(res: Response, statusCode: number, body: { success: boolean; status_code: number; message: string; data: any }) {
  return res.status(statusCode).json(body);
}

async function buildRmLoginData(rm: any) {
  const raId = await findRaIdByFranchiseeId(rm.franchisee_id ?? null);
  const token = signRmToken(rm);
  return {
    token,
    user: {
      id: rm.id,
      username: (rm.rm_id ?? rm.email ?? rm.phone) as string,
      email: rm.email ?? null,
      full_name: rm.name,
      role: "rm",
      role_name: "Relationship Manager",
    },
    profile: {
      id: rm.id,
      user_id: rm.user_id ?? null,
      rm_id: rm.rm_id ?? null,
      franchisee_id: rm.franchisee_id ?? null,
      ra_id: raId,
      name: rm.name,
      father_name: rm.father_name ?? null,
      date_of_birth: rm.date_of_birth ?? null,
      gender: rm.gender ?? null,
      photo: rm.photo ?? null,
      phone: rm.phone,
      email: rm.email ?? null,
      address: rm.address ?? null,
      wallet_balance: rm.wallet_balance ?? 0,
      wallet_status: rm.wallet_status ?? "active",
      status: rm.status,
    },
  };
}

const phoneSchema = z.object({
  phone: z.string().min(6).max(20),
  role: z.literal("rm").optional(),
});

export async function requestOtp(req: Request, res: Response) {
  const parsed = phoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return send(res, 400, {
      success: false,
      status_code: 400,
      message: "Invalid request",
      data: null,
    });
  }

  const rm = await findActiveRmByPhone(parsed.data.phone);
  if (!rm)
    return send(res, 404, {
      success: false,
      status_code: 404,
      message: "Phone number not registered",
      data: null,
    });

  const { otp } = generateOtp(rm.phone, 300);
  const meta = getOtpMeta(rm.phone);
  const otpId = meta?.otpId ?? 0;
  const expiresIn = meta?.expiresInSeconds ?? 300;
  const sentCount = meta?.sentCount ?? 1;
  const MAX_SEND = 5;
  const remainingAttempts = Math.max(0, MAX_SEND - sentCount);

  return send(res, 200, {
    success: true,
    status_code: 200,
    message: "OTP sent successfully to your mobile number! Valid for 5 minutes.",
    data: {
      otp_id: otpId,
      expires_in: expiresIn,
      phone: maskPhone(rm.phone),
      otp_sent_count: sentCount,
      remaining_attempts: remainingAttempts,
      otp, // keep for testing; remove when SMS integrated
    },
  });
}

const loginOtpSchema = z.object({
  phone: z.string().min(6).max(20),
  otp: z.string().min(4).max(10),
  role: z.literal("rm").optional(),
});

export async function loginWithOtp(req: Request, res: Response) {
  const parsed = loginOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return send(res, 400, {
      success: false,
      status_code: 400,
      message: "Invalid request",
      data: null,
    });
  }

  const rm = await findActiveRmByPhone(parsed.data.phone);
  if (!rm)
    return send(res, 404, {
      success: false,
      status_code: 404,
      message: "Phone number not registered",
      data: null,
    });

  const ok = verifyOtp(rm.phone, parsed.data.otp);
  if (!ok)
    return send(res, 401, {
      success: false,
      status_code: 401,
      message: "Invalid or expired OTP",
      data: null,
    });

  const data = await buildRmLoginData(rm);
  return send(res, 200, {
    success: true,
    status_code: 200,
    message: "Login successful",
    data,
  });
}

const loginPasswordSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(200),
});

export async function loginWithPassword(req: Request, res: Response) {
  const parsed = loginPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return send(res, 400, {
      success: false,
      status_code: 400,
      message: "Invalid request",
      data: null,
    });
  }

  const rm = await findActiveRmByLoginId(parsed.data.username);
  if (!rm)
    return send(res, 401, {
      success: false,
      status_code: 401,
      message: "Invalid username or password",
      data: null,
    });

  const expected = process.env.RM_LOGIN_PASSWORD ?? null;
  if (!expected) {
    return send(res, 500, {
      success: false,
      status_code: 500,
      message: "Server not configured",
      data: null,
    });
  }

  if (parsed.data.password !== expected) {
    return send(res, 401, {
      success: false,
      status_code: 401,
      message: "Invalid username or password",
      data: null,
    });
  }

  const data = await buildRmLoginData(rm);
  return send(res, 200, {
    success: true,
    status_code: 200,
    message: "Login successful",
    data,
  });
}

