import { Router } from "express";
import { rmCheckoutCreate } from "../controllers/rm-checkout.controller";

export const rmCheckoutRouter = Router();

rmCheckoutRouter.post("/", rmCheckoutCreate);

