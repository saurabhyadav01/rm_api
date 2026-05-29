import { Router } from "express";
import { loginWithOtp, loginWithPassword, requestOtp } from "../controllers/auth.controller";

export const authRouter = Router();

// New contract (as requested)
authRouter.post("/login", loginWithPassword); // { username, password }
authRouter.post("/send-otp", requestOtp); // { phone, role: "rm" }
authRouter.post("/verify-otp", loginWithOtp); // { phone, otp, role: "rm" }

