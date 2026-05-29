import { Router } from "express";
import { storesList } from "../controllers/stores-list.controller";
import { storeOnboarding } from "../controllers/store-onboarding.controller";
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

// Alias: search (optional keyword filter)
storesRouter.options("/search", (_req, res) => res.sendStatus(200));
storesRouter.get("/search", storesList);
storesRouter.post("/search", storesList);

// Store onboarding (PHP mobile app) — same handler for all paths
const onboardPaths = ["/onboard", "/add", "/add-store"] as const;
for (const path of onboardPaths) {
  storesRouter.options(path, (_req, res) => res.sendStatus(200));
  storesRouter.all(path, postOnlyGuard, storeOnboarding);
}

// Store update by mobile (PHP update store)
const updatePaths = ["/update", "/update-store"] as const;
for (const path of updatePaths) {
  storesRouter.options(path, (_req, res) => res.sendStatus(200));
  storesRouter.all(path, postOnlyGuard, storeUpdate);
}
