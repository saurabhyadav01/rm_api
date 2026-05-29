import { Router } from "express";
import { productsSearch } from "../controllers/products-search.controller";
import { looseProductsSearch } from "../controllers/loose-products-search.controller";
import { productsListWithAttributes } from "../controllers/products-list-with-attributes.controller";
import { productsAddWithAttributes } from "../controllers/products-add-with-attributes.controller";
import { productsAddNotListedWithAttributes } from "../controllers/products-add-not-listed-with-attributes.controller";
import { productsUpdateWithAttributes } from "../controllers/products-update-with-attributes.controller";
import { productsSoftDelete } from "../controllers/products-soft-delete.controller";

export const productsRouter = Router();

productsRouter.post("/search", productsSearch);
productsRouter.post("/loose/search", looseProductsSearch);
productsRouter.post("/list-with-attributes", productsListWithAttributes);
productsRouter.post("/add-with-attributes", productsAddWithAttributes);
productsRouter.post("/add-not-listed-with-attributes", productsAddNotListedWithAttributes);
productsRouter.options("/update-with-attributes", (_req, res) => res.sendStatus(200));
productsRouter.post("/update-with-attributes", productsUpdateWithAttributes);
productsRouter.post("/soft-delete", productsSoftDelete);

