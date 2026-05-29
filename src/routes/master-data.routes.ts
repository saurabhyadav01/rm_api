import { Router } from "express";
import { masterData } from "../controllers/master-data.controller";

export const masterDataRouter = Router();

masterDataRouter.options("/", (_req, res) => res.sendStatus(200));
masterDataRouter.get("/", masterData);
masterDataRouter.post("/", masterData);
