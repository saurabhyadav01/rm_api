import { type Request, type Response } from "express";
import { looseProductsSearchService } from "../services/loose-products-search.service";

type RawBodyRequest = Request & { rawBody?: string };

export async function looseProductsSearch(req: RawBodyRequest, res: Response) {
  const raw = (req.rawBody ?? "").toString();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  const result = await looseProductsSearchService(data);
  return res.json(result);
}

