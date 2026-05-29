import { Router } from "express";
import { onboardingImageUpload, onboardingImageUploadMiddleware } from "../controllers/onboarding-image-upload.controller";

export const onboardingImageUploadRouter = Router();

onboardingImageUploadRouter.post("/", onboardingImageUploadMiddleware, onboardingImageUpload);

