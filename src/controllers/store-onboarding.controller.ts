import { type Request, type Response } from "express";
import { storeOnboardingService } from "../services/store-onboarding.service";

type RawBodyRequest = Request & { rawBody?: string };

function parseOnboardingBody(req: RawBodyRequest): Record<string, unknown> | null {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    const keys = Object.keys(req.body as object);
    if (keys.length > 0) return req.body as Record<string, unknown>;
  }

  const raw = (req.rawBody ?? "").toString();
  if (!raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function storeOnboarding(req: RawBodyRequest, res: Response) {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST.",
    });
  }

  const data = parseOnboardingBody(req);
  if (!data) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
    });
  }

  const result = await storeOnboardingService(data);
  return res.status(result.httpStatus).json(result.body);
}
