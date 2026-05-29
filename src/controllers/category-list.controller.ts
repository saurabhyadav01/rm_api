import { type Request, type Response } from "express";
import { categoryListService } from "../services/category-list.service";

export async function categoryList(req: Request, res: Response) {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      ResponseCode: "405",
      Result: "false",
      ResponseMsg: "Method Not Allowed",
    });
  }

  const result = await categoryListService();
  return res.status(result.httpStatus).json(result.body);
}
