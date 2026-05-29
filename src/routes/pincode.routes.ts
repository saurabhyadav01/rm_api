import { Router } from "express";
import { pincodeLookup } from "../controllers/pincode.controller";

export const pincodeRouter = Router();

pincodeRouter.options("/", (_req, res) => res.sendStatus(200));
pincodeRouter.post("/", pincodeLookup);
