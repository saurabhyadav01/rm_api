import { type Request, type Response } from "express";
import { storesListService } from "../services/stores-list.service";
import { parseStoresListInput } from "../utils/parse-stores-list-input";

type RawBodyRequest = Request & { rawBody?: string };

export async function storesList(req: RawBodyRequest, res: Response) {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST or GET.",
    });
  }

  const input = parseStoresListInput(req);
  if (!String(input.rm_id ?? "").trim()) {
    return res.status(400).json({
      success: false,
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "RM ID is required",
    });
  }

  const result = await storesListService(input);
  return res.status(result.httpStatus).json(result.body);
}
