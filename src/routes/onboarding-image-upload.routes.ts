import { Router } from "express";
import multer from "multer";
import {
  onboardingImageUpload,
  onboardingImageUploadMiddleware,
} from "../controllers/onboarding-image-upload.controller";
import { onboardingImageMaxMbLabel } from "../config/upload-limits";

export const onboardingImageUploadRouter = Router();

onboardingImageUploadRouter.post("/", (req, res, next) => {
  onboardingImageUploadMiddleware(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.json({
          ResponseCode: "400",
          Result: "false",
          message: `File exceeds the maximum allowed size of ${onboardingImageMaxMbLabel()}`,
        });
      }
      return res.json({
        ResponseCode: "400",
        Result: "false",
        message: err.message || "Invalid file upload",
      });
    }
    if (err) return next(err);
    return onboardingImageUpload(req, res);
  });
});
