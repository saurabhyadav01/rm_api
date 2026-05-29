import { Router } from "express";
import { productsSearch } from "../controllers/products-search.controller";
import { looseProductsSearch } from "../controllers/loose-products-search.controller";
import { productsListWithAttributes } from "../controllers/products-list-with-attributes.controller";
import { productsAddWithAttributes } from "../controllers/products-add-with-attributes.controller";
import { productsSoftDelete } from "../controllers/products-soft-delete.controller";

export const productsRouter = Router();

productsRouter.post("/search", productsSearch);
// Backwards-compatible alias for the older behavior (optional keyword, min limit 20)
productsRouter.post("/search_v1", productsSearch);

// Loose products global search
productsRouter.post("/loose/search", looseProductsSearch);

// Product list with multiple attributes (store scoped)
productsRouter.post("/list-with-attributes", productsListWithAttributes);
productsRouter.post("/list_with_attributes", productsListWithAttributes);

// Add product + attributes
productsRouter.post("/add-with-attributes", productsAddWithAttributes);
productsRouter.post("/add_with_attributes", productsAddWithAttributes);

// Soft delete product
productsRouter.post("/soft-delete", productsSoftDelete);
productsRouter.post("/soft_delete", productsSoftDelete);

