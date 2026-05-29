import { type Request, type Response } from "express";
import { z } from "zod";
import { storesListService } from "../services/stores-list.service";

const bodySchema = z
  .object({
    rm_id: z.string().optional(),
    keyword: z.string().optional(),
    status: z.union([z.string(), z.number()]).optional(),
    page: z.union([z.number(), z.string()]).optional(),
    limit: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export async function storesList(req: Request, res: Response) {
  const data = bodySchema.safeParse(req.body);
  if (!data.success || !data.data || !data.data.rm_id) {
    return res.status(400).json({
      success: false,
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "RM ID is required",
    });
  }

  const result = await storesListService({
    rm_id: String(data.data.rm_id),
    keyword: data.data.keyword,
    status: data.data.status,
    page: data.data.page,
    limit: data.data.limit,
  });

  return res.status(result.httpStatus).json(result.body);
}

