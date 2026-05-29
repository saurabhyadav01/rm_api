import { Router } from "express";
import { storesList } from "../controllers/stores-list.controller";
import { storesSearch } from "../controllers/stores-search.controller";
import { storeOnboarding } from "../controllers/store-onboarding.controller";
import { storeSendOtp } from "../controllers/store-send-otp.controller";
import { storeVerifyOtp } from "../controllers/store-verify-otp.controller";
import { storeUpdate } from "../controllers/store-update.controller";

export const storesRouter = Router();

const postOnlyGuard = (req: { method: string }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
  if (req.method === "OPTIONS") return next();
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST.",
    });
  }
  return next();
};

// Store list — GET query or POST JSON (PHP mobile app)
storesRouter.options("/list", (_req, res) => res.sendStatus(200));
storesRouter.get("/list", storesList);
storesRouter.post("/list", storesList);

// Search stores by RM (PHP search_stores — POST only)
storesRouter.options("/search", (_req, res) => res.sendStatus(200));
storesRouter.post("/search", storesSearch);

// Send store onboarding OTP
storesRouter.options("/send-otp", (_req, res) => res.sendStatus(200));
storesRouter.post("/send-otp", storeSendOtp);

// Verify store onboarding OTP
storesRouter.options("/verify-otp", (_req, res) => res.sendStatus(200));
storesRouter.post("/verify-otp", storeVerifyOtp);

// Store onboarding
storesRouter.options("/onboard", (_req, res) => res.sendStatus(200));
storesRouter.all("/onboard", postOnlyGuard, storeOnboarding);

// Store update by mobile
storesRouter.options("/update", (_req, res) => res.sendStatus(200));
storesRouter.all("/update", postOnlyGuard, storeUpdate);
