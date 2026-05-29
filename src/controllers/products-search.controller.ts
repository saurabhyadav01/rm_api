import { type Request, type Response } from "express";
import { productsSearchService } from "../services/products-search.service";

type RawBodyRequest = Request & { rawBody?: string };

export async function productsSearch(req: RawBodyRequest, res: Response) {
  const raw = (req.rawBody ?? "").toString();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Match provided PHP: invalid JSON => ResponseCode 401 invalid JSON
    return res.json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "Invalid JSON data provided!",
    });
  }

  const result = await productsSearchService(data);
  return res.json(result);
}

