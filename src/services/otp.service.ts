type OtpRecord = {
  otpId: number;
  otp: string;
  expiresAtMs: number;
  sentCount: number;
};

const store = new Map<string, OtpRecord>(); // phone -> record
let nextOtpId = 1;

function now() {
  return Date.now();
}

export function generateOtp(phone: string, ttlSeconds = 300): { otp: string; expiresAtMs: number } {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAtMs = now() + ttlSeconds * 1000;
  const prev = store.get(phone);
  const record: OtpRecord = {
    otpId: prev?.otpId ?? nextOtpId++,
    otp,
    expiresAtMs,
    sentCount: (prev?.sentCount ?? 0) + 1,
  };
  store.set(phone, record);
  return { otp, expiresAtMs };
}

export function verifyOtp(phone: string, otp: string): boolean {
  const record = store.get(phone);
  if (!record) return false;
  if (record.expiresAtMs < now()) {
    store.delete(phone);
    return false;
  }
  const ok = record.otp === otp;
  if (ok) store.delete(phone);
  return ok;
}

export function getOtpMeta(phone: string): { otpId: number; expiresInSeconds: number; sentCount: number } | null {
  const record = store.get(phone);
  if (!record) return null;
  const remainingMs = Math.max(0, record.expiresAtMs - now());
  return {
    otpId: record.otpId,
    expiresInSeconds: Math.ceil(remainingMs / 1000),
    sentCount: record.sentCount,
  };
}

