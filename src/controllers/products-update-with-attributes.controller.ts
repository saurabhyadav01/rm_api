import { type Request, type Response } from "express";
import { productsUpdateWithAttributesService } from "../services/products-update-with-attributes.service";

type RawBodyRequest = Request & { rawBody?: string };

export async function productsUpdateWithAttributes(req: RawBodyRequest, res: Response) {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST.",
    });
  }

  const rawData = (req.rawBody ?? "").toString();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawData) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: `Invalid JSON data: ${msg}`,
      raw_data: rawData.slice(0, 100),
    });
  }

  if (!data || typeof data !== "object") {
    return res.json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "Invalid JSON data: Invalid value",
      raw_data: rawData.slice(0, 100),
    });
  }

  const result = await productsUpdateWithAttributesService(data);
  return res.json(result);
}
