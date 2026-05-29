import { type Request, type Response } from "express";
import { ZodError, z } from "zod";
import { upsertNonOnboardedStoreService } from "../services/non-onboarded-store.service";

const bodySchema = z
  .object({
    store_id: z.string().optional(), // OPTIONAL (for update)

    rm_id: z.string().optional(),
    shop_name: z.string().optional(),
    owner_name: z.string().optional(),
    phone_no: z.string().optional(),
    category: z.string().optional(),

    latitude: z.union([z.string(), z.number()]).optional(),
    longitude: z.union([z.string(), z.number()]).optional(),
    current_location: z.string().optional(),

    address_line: z.string().optional(),
    city: z.string().optional(),
    area: z.string().optional(),
    district: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),

    email: z.string().optional(),
    banner: z.string().optional(),

    non_onboarding_reason: z.string().optional(),
    expected_onboarding_value: z.union([z.string(), z.number()]).nullable().optional(),
    expected_onboarding_unit: z.string().optional(),
  })
  .passthrough();

export async function upsertNonOnboardedStore(req: Request, res: Response) {
  try {
    const data = bodySchema.parse(req.body);
    const result = await upsertNonOnboardedStoreService(data);
    return res.status(result.httpStatus).json(result.body);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(200).json({
        ResponseCode: "400",
        Result: "false",
        message: "Invalid JSON body",
      });
    }

    // eslint-disable-next-line no-console
    console.error("[rm] non_onboarded_store error", err);
    return res.status(200).json({
      ResponseCode: "500",
      Result: "false",
      message: "Network  error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

