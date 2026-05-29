import { type Request, type Response } from "express";
import { rmCheckoutCreateService } from "../services/rm-checkout.service";

type RawBodyRequest = Request & { rawBody?: string };

export async function rmCheckoutCreate(req: RawBodyRequest, res: Response) {
  const rawData = (req.rawBody ?? "").toString();

  // Handle empty input
  if (!rawData || rawData.trim() === "") {
    return res.json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "No data received. Please send JSON data in request body.",
    });
  }

  let data: any;
  try {
    data = JSON.parse(rawData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: `Invalid JSON data: ${msg}`,
    });
  }

  if (!data || typeof data !== "object") {
    return res.json({
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "Invalid JSON data: Invalid value",
    });
  }

  const result = await rmCheckoutCreateService(data);
  return res.json(result);
}

