import { type Request } from "express";
import { type StoresListInput } from "../services/stores-list.service";

type RawBodyRequest = Request & { rawBody?: string };

/** Shared POST/GET body parser for stores list and search (same filters + pagination). */
export function parseStoresListInput(req: RawBodyRequest): StoresListInput {
  if (req.method === "GET") {
    const q = req.query;
    return {
      rm_id: String(q.rm_id ?? ""),
      page: q.page,
      limit: q.limit,
      start_date: q.start_date,
      end_date: q.end_date,
      status: q.status,
      business_type: q.business_type,
      include_product_counts: q.include_product_counts,
      keyword: q.keyword,
    };
  }

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
    page: body.page,
    limit: body.limit,
    start_date: body.start_date,
    end_date: body.end_date,
    status: body.status,
    business_type: body.business_type,
    include_product_counts: body.include_product_counts,
    keyword: body.keyword,
  };
}
