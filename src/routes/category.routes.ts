import { Router } from "express";
import { categoryByType } from "../controllers/category-by-type.controller";
import { categoryList } from "../controllers/category-list.controller";

export const categoryRouter = Router();

categoryRouter.options("/", (_req, res) => res.sendStatus(200));
categoryRouter.get("/", categoryList);
categoryRouter.post("/", categoryList);

categoryRouter.options("/by-type", (_req, res) => res.sendStatus(200));
categoryRouter.post("/by-type", categoryByType);
