import { type Request, type Response } from "express";
import { pincodeLookupService } from "../services/pincode.service";

type RawBodyRequest = Request & { rawBody?: string };

function parsePincode(req: RawBodyRequest): string {
  let body: Record<string, unknown> = {};
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
        return "";
      }
    }
  }
  return String(body.pincode ?? "").trim();
}

export async function pincodeLookup(req: RawBodyRequest, res: Response) {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      Message: "Method Not Allowed",
      Status: "Error",
      PostOffice: [],
    });
  }

  const result = await pincodeLookupService({ pincode: parsePincode(req) });
  return res.status(result.httpStatus).json(result.body);
}
