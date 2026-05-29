import { Router } from "express";
import { getApiInfo } from "../controllers/api.controller";
import { authRouter } from "./auth.routes";
import { healthRouter } from "./health.routes";
import { nonOnboardedStoreRouter } from "./non-onboarded-store.routes";
import { onboardingImageUploadRouter } from "./onboarding-image-upload.routes";
import { productsRouter } from "./products.routes";
import { rmCheckoutRouter } from "./rm-checkout.routes";
import { storesRouter } from "./stores.routes";
import { todoRouter } from "./todo.routes";

export const router = Router();

/** Route index — GET /api/v1 (also /api for legacy) */
router.get("/", getApiInfo);

router.use("/auth", authRouter);
router.use("/health", healthRouter);
router.use("/non_onboarded_store", nonOnboardedStoreRouter);
router.use("/onboarding-image-upload", onboardingImageUploadRouter);
router.use("/products", productsRouter);
router.use("/rm_checkout", rmCheckoutRouter);
router.use("/stores", storesRouter);
router.use("/todos", todoRouter);

