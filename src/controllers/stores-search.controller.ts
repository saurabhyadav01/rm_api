import { type Request, type Response } from "express";
import { storesSearchService } from "../services/stores-search.service";
import { parseStoresListInput } from "../utils/parse-stores-list-input";

type RawBodyRequest = Request & { rawBody?: string };

export async function storesSearch(req: RawBodyRequest, res: Response) {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      ResponseCode: "405",
      Result: "false",
      ResponseMsg: "Method Not Allowed. Please use POST with JSON body.",
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

  const result = await storesSearchService(input);
  return res.status(result.httpStatus).json(result.body);
}
