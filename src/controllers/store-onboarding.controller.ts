import { type Request, type Response } from "express";
import { z } from "zod";
import { storeOnboardingService } from "../services/store-onboarding.service";

const bodySchema = z.record(z.unknown());

export async function storeOnboarding(req: Request, res: Response) {
  // Only POST (matches PHP)
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST.",
    });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success || !parsed.data) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
    });
  }

  const result = await storeOnboardingService(parsed.data);
  return res.status(result.httpStatus).json(result.body);
}

