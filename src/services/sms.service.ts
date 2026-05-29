import axios from "axios";
import { normalizePhoneInput } from "../utils/phone";
import { getOtpMessage } from "../utils/otp-message";

const SMS_API_URL = (process.env.SMS_BASE_URL || "https://smsapi.edumarcsms.com/api/v1/sendsms").trim();
const SMS_API_KEY = (process.env.SMS_API_KEY || "").trim();
const SMS_SENDER_ID = (process.env.SMS_SENDER_ID || "HCHOTU").trim();
const SMS_OTP_TEMPLATE_ID = (process.env.SMS_OTP_TEMPLATE_ID || "1207176182760456483").trim();

export function isSmsConfigured(): boolean {
  return SMS_API_KEY.length > 0;
}

/** 10-digit mobile for SMS provider */
export function toSmsMobileNumber(phone: string): string {
  const { last10, digits } = normalizePhoneInput(phone);
  if (last10.length === 10) return last10;
  return digits.slice(-10);
}

export class SmsSendError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly providerBody?: unknown,
  ) {
    super(message);
    this.name = "SmsSendError";
  }
}

/** Send OTP via HelloChotu SMS provider (EduMarc). */
/** Store onboarding welcome SMS (optional template). Returns provider payload or error object. */
export async function sendOnboardingMessages(
  phone: string,
  ownerName: string,
  onboardingFee: number,
): Promise<unknown> {
  if (!isSmsConfigured()) {
    return { error: "SMS_API_KEY is not configured on the server" };
  }

  const templateId = (process.env.SMS_ONBOARDING_TEMPLATE_ID || "").trim();
  const localNumber = toSmsMobileNumber(phone);
  if (localNumber.length !== 10) {
    return { error: "Invalid mobile number for SMS" };
  }

  const feeText = Number.isFinite(onboardingFee) ? String(Math.round(onboardingFee)) : "0";
  const message =
    (process.env.SMS_ONBOARDING_MESSAGE || "").trim() ||
    `Hello ${ownerName}, welcome to HelloChotu! Your onboarding fee is Rs ${feeText}. Thank you for joining us.`;

  const requestBody: Record<string, unknown> = {
    number: [localNumber],
    message,
    senderId: SMS_SENDER_ID,
  };
  if (templateId) requestBody.templateId = templateId;

  try {
    const response = await axios.post(SMS_API_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
        apikey: SMS_API_KEY,
      },
      timeout: Number(process.env.SMS_TIMEOUT_MS || 15000),
    });
    return response.data;
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown } };
    return { error: err.message || "Failed to send onboarding SMS", provider: err.response?.data };
  }
}

export async function sendOtpSms(phone: string, otp: string, lang = "en"): Promise<void> {
  if (!isSmsConfigured()) {
    throw new SmsSendError("SMS_API_KEY is not configured on the server");
  }

  const localNumber = toSmsMobileNumber(phone);
  if (localNumber.length !== 10) {
    throw new SmsSendError("Invalid mobile number for SMS");
  }

  const message = getOtpMessage(lang, otp);
  const requestBody = {
    number: [localNumber],
    message,
    senderId: SMS_SENDER_ID,
    templateId: SMS_OTP_TEMPLATE_ID,
  };

  try {
    const response = await axios.post(SMS_API_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
        apikey: SMS_API_KEY,
      },
      timeout: Number(process.env.SMS_TIMEOUT_MS || 15000),
    });

    // eslint-disable-next-line no-console
    console.log("[rm][sms] OTP sent", { number: localNumber, provider: response.data });
  } catch (error: unknown) {
    const err = error as { response?: { status?: number; data?: unknown }; message?: string };
    const status = err.response?.status;
    const body = err.response?.data;
    // eslint-disable-next-line no-console
    console.error("[rm][sms] failed", { number: localNumber, status, body, message: err.message });

    if (status === 401) {
      throw new SmsSendError("SMS provider rejected API key (401). Check SMS_API_KEY in .env", status, body);
    }
    throw new SmsSendError(
      err.message || "Failed to send OTP SMS",
      status,
      body,
    );
  }
}
