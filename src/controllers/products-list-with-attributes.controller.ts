import { type Request, type Response } from "express";
import { productsListWithAttributesService } from "../services/products-list-with-attributes.service";

type RawBodyRequest = Request & { rawBody?: string };

export async function productsListWithAttributes(req: RawBodyRequest, res: Response) {
  const raw = (req.rawBody ?? "").toString();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // PHP: invalid JSON => $data null => empty(store_id) => store_id required response
    data = null;
  }

  const result = await productsListWithAttributesService(data);
  return res.json(result);
}

