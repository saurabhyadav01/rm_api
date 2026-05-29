import { type Request, type Response } from "express";
import { masterDataService } from "../services/master-data.service";

export async function masterData(req: Request, res: Response) {
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

  const result = await masterDataService();
  return res.status(result.httpStatus).json(result.body);
}
