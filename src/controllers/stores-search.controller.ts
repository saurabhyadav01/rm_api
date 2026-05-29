import { type Request, type Response } from "express";
import { storesSearchService, type StoresSearchInput } from "../services/stores-search.service";

type RawBodyRequest = Request & { rawBody?: string };

function parseSearchBody(req: RawBodyRequest): StoresSearchInput {
  let body: Record<string, unknown> = {};
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    body = req.body as Record<string, unknown>;
  } else {
    const raw = (req.rawBody ?? "").toString();
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        body = {};
      }
    }
  }

  return {
    rm_id: String(body.rm_id ?? ""),
    keyword: body.keyword,
    status: body.status,
    page: body.page,
    limit: body.limit,
  };
}

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

  const input = parseSearchBody(req);
  const result = await storesSearchService(input);
  return res.status(result.httpStatus).json(result.body);
}
