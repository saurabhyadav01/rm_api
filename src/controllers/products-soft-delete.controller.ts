import { type Request, type Response } from "express";
import { productsSoftDeleteService } from "../services/products-soft-delete.service";

type RawBodyRequest = Request & { rawBody?: string };

export async function productsSoftDelete(req: RawBodyRequest, res: Response) {
  const raw = (req.rawBody ?? "").toString();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // PHP: invalid JSON => $data null => required fields missing response
    data = null;
  }

  const result = await productsSoftDeleteService(data);
  return res.json(result);
}

