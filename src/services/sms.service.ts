import axios from "axios";
import { normalizePhoneInput } from "../utils/phone";
import { getOtpMessage } from "../utils/otp-message";

const SMS_API_URL = (process.env.SMS_BASE_URL || "https://smsapi.edumarcsms.com/api/v1/sendsms").trim();
const SMS_API_KEY = (process.env.SMS_API_KEY || "").trim();
const SMS_SENDER_ID = (process.env.SMS_SENDER_ID || "HCHOTU").trim();
const SMS_OTP_TEMPLATE_ID = (process.env.SMS_OTP_TEMPLATE_ID || "1207176182760456483").trim();
const SMS_ONBOARDING_SENDER_ID = (process.env.SMS_ONBOARDING_SENDER_ID || "HCWELC").trim();
const SMS_ONBOARDING_WELCOME_TEMPLATE_ID = (
  process.env.SMS_ONBOARDING_WELCOME_TEMPLATE_ID || "1207176845608988452"
).trim();
const SMS_ONBOARDING_APP_LINK_TEMPLATE_ID = (
  process.env.SMS_ONBOARDING_APP_LINK_TEMPLATE_ID || "1207176882612909236"
).trim();

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

/** EduMarc SMS — mirrors PHP SmsHelper::sendSMS */
async function sendSmsMessage(
  mobile: string,
  message: string,
  templateId: string,
  senderId: string = SMS_SENDER_ID,
): Promise<unknown> {
  const requestBody = {
    number: [mobile],
    message,
    senderId,
    templateId,
  };

  const response = await axios.post(SMS_API_URL, requestBody, {
    headers: {
      "Content-Type": "application/json",
      apikey: SMS_API_KEY,
    },
    timeout: Number(process.env.SMS_TIMEOUT_MS || 30000),
  });

  // eslint-disable-next-line no-console
  console.log("[rm][sms] sent", { number: mobile, templateId, provider: response.data });
  return response.data;
}

function toOnboardingSmsMobile(phone: string): string {
  const localNumber = toSmsMobileNumber(phone);
  if (localNumber.length !== 10) return "";
  return `91${localNumber}`;
}

function parseSmsProviderResponse(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

/** Store onboarding welcome + app link SMS — mirrors PHP SmsHelper::sendOnboardingMessages */
export async function sendOnboardingMessages(
  phone: string,
  ownerName: string,
  onboardingFee: number,
): Promise<{ welcome_msg: unknown; app_link_msg: unknown } | { error: string; provider?: unknown }> {
  if (!isSmsConfigured()) {
    return { error: "SMS_API_KEY is not configured on the server" };
  }

  const mobile = toOnboardingSmsMobile(phone);
  if (!mobile) {
    return { error: "Invalid mobile number for SMS" };
  }

  const name = String(ownerName || "Retailer").trim() || "Retailer";
  const feeText = Number.isFinite(onboardingFee) ? String(Math.round(onboardingFee)) : "0";

  const message1 =
    `Welcome to Hello Chotu, ${name}! Your onboarding with Hello Chotu has been completed successfully. ` +
    `Onboarding Fee Received: ₹${feeText} You can log in anytime using your registered phone number and OTP. CULTNEST PRIVATE LIMITED`;

  const message2 =
    `Hello ${name} Download the Hello Chotu Retailer App ` +
    "https://play.google.com/store/apps/details?id=com.hellochotu.storeapp&pcampaignid=web_share " +
    "and log in using your registered phone number and OTP. If you need any assistance, please contact Hello Chotu support. CULTNEST PRIVATE LIMITED";

  try {
    const [res1, res2] = await Promise.all([
      sendSmsMessage(mobile, message1, SMS_ONBOARDING_WELCOME_TEMPLATE_ID, SMS_ONBOARDING_SENDER_ID),
      sendSmsMessage(mobile, message2, SMS_ONBOARDING_APP_LINK_TEMPLATE_ID, SMS_ONBOARDING_SENDER_ID),
    ]);

    return {
      welcome_msg: parseSmsProviderResponse(res1),
      app_link_msg: parseSmsProviderResponse(res2),
    };
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown } };
    // eslint-disable-next-line no-console
    console.error("[rm][sms] onboarding failed", { mobile, message: err.message, provider: err.response?.data });
    return {
      error: err.message || "Failed to send onboarding SMS",
      provider: err.response?.data,
    };
  }
}

/** Store onboarding OTP — PHP sends `ccode` + 10-digit mobile (e.g. 917518553073). */
export async function sendStoreOtpSms(mobile: string, otp: string, ccode: string): Promise<void> {
  if (!isSmsConfigured()) {
    throw new SmsSendError("SMS_API_KEY is not configured on the server");
  }

  const localNumber = toSmsMobileNumber(mobile);
  if (localNumber.length !== 10) {
    throw new SmsSendError("Invalid mobile number for SMS");
  }

  const ccodeDigits = String(ccode ?? "91").replace(/\D/g, "") || "91";
  const message = getOtpMessage("en", otp);
  const requestBody = {
    number: [`${ccodeDigits}${localNumber}`],
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
    console.log("[rm][sms] store OTP sent", { number: requestBody.number, provider: response.data });
  } catch (error: unknown) {
    const err = error as { response?: { status?: number; data?: unknown }; message?: string };
    const status = err.response?.status;
    const body = err.response?.data;
    // eslint-disable-next-line no-console
    console.error("[rm][sms] store OTP failed", { number: requestBody.number, status, body, message: err.message });

    if (status === 401) {
      throw new SmsSendError("SMS provider rejected API key (401). Check SMS_API_KEY in .env", status, body);
    }
    throw new SmsSendError(err.message || "Failed to send OTP SMS", status, body);
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
