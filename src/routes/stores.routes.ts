import { Router } from "express";
import { storesList } from "../controllers/stores-list.controller";
import { storeOnboarding } from "../controllers/store-onboarding.controller";

export const storesRouter = Router();

storesRouter.options("/list", (_req, res) => res.sendStatus(200));
storesRouter.all("/list", (req, res, next) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      ResponseCode: "405",
      Result: "false",
      ResponseMsg: "Method Not Allowed. Please use POST with JSON body.",
    });
  }
  return next();
});
storesRouter.post("/list", storesList);

// Alias: search endpoint (same behavior/response)
storesRouter.options("/search", (_req, res) => res.sendStatus(200));
storesRouter.all("/search", (req, res, next) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      ResponseCode: "405",
      Result: "false",
      ResponseMsg: "Method Not Allowed. Please use POST with JSON body.",
    });
  }
  return next();
});
storesRouter.post("/search", storesList);
storesRouter.post("/onboard", storeOnboarding);

