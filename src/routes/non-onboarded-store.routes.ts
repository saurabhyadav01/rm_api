import { Router } from "express";
import { upsertNonOnboardedStore } from "../controllers/non-onboarded-store.controller";
import { listNonOnboardedStores } from "../controllers/non-onboarded-store-list.controller";
import { searchNonOnboardedStores } from "../controllers/non-onboarded-store-search.controller";

export const nonOnboardedStoreRouter = Router();

// Single endpoint, same semantics as provided PHP code
nonOnboardedStoreRouter.post("/", upsertNonOnboardedStore);

// List endpoint (same request/response shape as provided PHP code)
nonOnboardedStoreRouter.options("/list", (_req, res) => res.sendStatus(200));
nonOnboardedStoreRouter.all("/list", (req, res, next) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      ResponseCode: "405",
      Result: "false",
      ResponseMsg: "Method Not Allowed",
    });
  }
  return next();
});
nonOnboardedStoreRouter.post("/list", listNonOnboardedStores);

// Search non-onboarded stores by RM (PHP — POST only)
nonOnboardedStoreRouter.options("/search", (_req, res) => res.sendStatus(200));
nonOnboardedStoreRouter.post("/search", searchNonOnboardedStores);

