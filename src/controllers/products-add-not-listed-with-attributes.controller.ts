import { type Request, type Response } from "express";
import { productsAddNotListedWithAttributesService } from "../services/products-add-not-listed-with-attributes.service";

type RawBodyRequest = Request & { rawBody?: string };

export async function productsAddNotListedWithAttributes(req: RawBodyRequest, res: Response) {
  const rawData = (req.rawBody ?? "").toString();
  let data: any;
  try {
    data = JSON.parse(rawData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: `Invalid JSON data: ${msg}`,
      raw_data: rawData.slice(0, 100),
    });
  }

  if (!data) {
    return res.json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "Invalid JSON data: Invalid value",
      raw_data: rawData.slice(0, 100),
    });
  }

  const result = await productsAddNotListedWithAttributesService(data);
  return res.json(result);
}

