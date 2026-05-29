import { type Request, type Response } from "express";
import { storeSendOtpService } from "../services/store-send-otp.service";

type RawBodyRequest = Request & { rawBody?: string };

function parseBody(req: RawBodyRequest) {
  let body: Record<string, unknown> | null = null;
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    body = req.body as Record<string, unknown>;
  } else {
    const raw = (req.rawBody ?? "").toString();
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        body = null;
      }
    }
  }
  return body;
}

export async function storeSendOtp(req: RawBodyRequest, res: Response) {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ResponseCode: "405",
      Result: "false",
      ResponseMsg: "Method Not Allowed",
    });
  }

  const body = parseBody(req);
  if (!body || !String(body.mobile ?? "").trim()) {
    return res.status(200).json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "Mobile number is required!",
    });
  }

  const result = await storeSendOtpService({
    mobile: String(body.mobile ?? "").trim(),
    ccode: body.ccode !== undefined && body.ccode !== null ? String(body.ccode) : undefined,
  });
  return res.status(result.httpStatus).json(result.body);
}
