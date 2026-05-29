import { pool } from "../db/mysql";
import { useProductSchemaV2 } from "../config/schema";
import { resolveStoreNumericId } from "../utils/resolve-store-id";
import {
  fetchProductCategoryMap,
  fetchVariantsByProductId,
  mapVariantToLegacyAttribute,
  PRODUCT_TITLE_SQL,
  productImageFromRow,
  productTitleFromRow,
} from "./product-v2.shared";
import { type RowDataPacket } from "mysql2/promise";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback: number) {
  const n = Number(s(v));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

type ProductRow = RowDataPacket & Record<string, any>;
type CategoryRow = RowDataPacket & { title: string | null };
type ProductCategoryRow = RowDataPacket & { name: string | null };
type AttrRow = RowDataPacket & Record<string, any>;
type CountRow = RowDataPacket & { total: number };

function cleanText(v: unknown) {
  let t = String(v ?? "");
  if (!t) return "";
  // Basic cleanup similar to PHP (strip tags and remove backslashes)
  t = t.replace(/<[^>]*>/g, "");
  t = t.replace(/\\+/g, "");
  return t.trim();
}

function cleanDescription(v: unknown) {
  let d = String(v ?? "");
  if (!d) return "";
  d = d.replace(/<[^>]*>/g, "");
  d = d.replace(/\\+r?\\*n/gi, " ");
  d = d.replace(/\\+/g, "");
  d = d.replace(/[\r\n]+/g, " ");
  d = d.replace(/\s+/g, " ").trim();
  return d;
}

function parseKeyValueLines(v: unknown): Record<string, string> | null {
  let txt = String(v ?? "");
  if (!txt) return null;
  txt = txt.replace(/<[^>]*>/g, "");
  txt = txt.replace(/\\+r?\\*n/gi, "\n");
  txt = txt.replace(/\\+/g, "");
  txt = txt.replace(/\r\n/g, "\n");
  const lines = txt.split("\n").map((x) => x.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

export async function productsSearchService(data: any): Promise<Record<string, unknown>> {
  if (useProductSchemaV2()) {
    // V2 tables: products, product_variants, product_inventory, product_pricing
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ResponseCode: "401", Result: "false", ResponseMsg: "Invalid JSON data provided!" };
    }

    const store_id_raw = data.store_id !== undefined ? s(data.store_id) : "";
    if (!store_id_raw) return { ResponseCode: "401", Result: "false", ResponseMsg: "store_id is required" };
    const store_id = await resolveStoreNumericId(store_id_raw);
    if (!store_id) {
      return { ResponseCode: "401", Result: "false", ResponseMsg: "Invalid store_id" };
    }

    const keyword = data.keyword !== undefined ? s(data.keyword) : "";
    if (!keyword) return { ResponseCode: "401", Result: "false", ResponseMsg: "keyword is required" };

    let page = data.page !== undefined ? toInt(data.page, 1) : 1;
    if (page < 1) page = 1;
    let limit = data.limit !== undefined ? toInt(data.limit, 20) : 20;
    if (limit < 1) limit = 20;
    const offset = (page - 1) * limit;

    type CountRowV2 = RowDataPacket & { total: number };
    const [countRows] = await pool.query<CountRowV2[]>(
      `
      SELECT COUNT(*) AS total
      FROM products p
      WHERE p.store_id = :store_id
        AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
        AND ${PRODUCT_TITLE_SQL} LIKE :kw
      `,
      { store_id, kw: `%${keyword}%` } as any,
    );
    const total = Number(countRows?.[0]?.total ?? 0);

    type ProductV2 = RowDataPacket & Record<string, any>;
    const [products] = await pool.query<ProductV2[]>(
      `
      SELECT p.*
      FROM products p
      WHERE p.store_id = :store_id
        AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
        AND ${PRODUCT_TITLE_SQL} LIKE :kw
      ORDER BY p.id DESC
      LIMIT :offset, :limit
      `,
      { store_id, kw: `%${keyword}%`, offset, limit } as any,
    );

    const productIds = (products ?? []).map((p) => Number(p.id));
    const categoryMap = await fetchProductCategoryMap(productIds);

    const productList: any[] = [];
    for (const product of products ?? []) {
      const cat = categoryMap.get(Number(product.id));
      const productData: any = {};
      productData.id = product.id;
      productData.store_id = product.store_id;
      productData.cat_id = cat?.cat_id ?? product.cat_id ?? product.category_id ?? null;
      productData.cat_name = cat?.cat_name ?? null;
      productData.sub_cat_id = cat?.sub_cat_id ?? product.sub_cat_id ?? product.subcategory_id ?? null;
      productData.sub_cat_name = cat?.sub_cat_name ?? "";
      productData.title = cleanText(productTitleFromRow(product));
      productData.img = productImageFromRow(product);
      productData.product_images = product.product_images ? (JSON.parse(String(product.product_images)) ?? []) : [];
      productData.description = cleanDescription(product.description);
      productData.status = product.status ?? "1";
      productData.about_product = parseKeyValueLines(product.about_product);
      productData.product_information = parseKeyValueLines(product.product_information);
      productData.fssai_lic = product.fssai_lic ?? null;

      const variants = await fetchVariantsByProductId(Number(product.id));
      const attributes = variants.map((v) => mapVariantToLegacyAttribute(v));
      productData.attributes = attributes;
      productData.attribute_count = attributes.length;

      productList.push(productData);
    }

    if (!productList.length) {
      return {
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: "No products found",
        total: 0,
        page,
        limit,
        total_pages: 0,
        productdata: [],
      };
    }

    return {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Products found successfully",
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      productdata: productList,
    };
  }

  // Provided PHP: data must be array/object
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "Invalid JSON data provided!",
    };
  }

  const store_id_raw = data.store_id !== undefined ? s(data.store_id) : "";
  if (!store_id_raw) return { ResponseCode: "401", Result: "false", ResponseMsg: "store_id is required" };
  const store_id = await resolveStoreNumericId(store_id_raw);
  if (!store_id) {
    return { ResponseCode: "401", Result: "false", ResponseMsg: "Invalid store_id" };
  }

  const keyword = data.keyword !== undefined ? s(data.keyword) : "";
  if (!keyword) return { ResponseCode: "401", Result: "false", ResponseMsg: "keyword is required" };

  let page = data && data.page !== undefined ? toInt(data.page, 1) : 1;
  if (page < 1) page = 1;

  let limit = data && data.limit !== undefined ? toInt(data.limit, 20) : 20;
  if (limit < 1) limit = 20;

  const offset = (page - 1) * limit;

  const whereParts: string[] = ["store_id = :store_id", "is_delete = 0"];
  const params: Record<string, unknown> = { store_id };

  whereParts.push("title LIKE :kw");
  params.kw = `%${keyword}%`;

  const whereClause = `WHERE ${whereParts.join(" AND ")}`;

  const [countRows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total FROM tbl_product ${whereClause}`,
    params as any,
  );
  const total = Number(countRows?.[0]?.total ?? 0);

  const [products] = await pool.query<ProductRow[]>(
    `SELECT * FROM tbl_product ${whereClause} ORDER BY id DESC LIMIT :offset, :limit`,
    ({ ...params, offset, limit } as any),
  );

  const productList: any[] = [];

  for (const product of products ?? []) {
    const cat_id = product.cat_id ? Number(product.cat_id) : 0;
    let cat_name: string | null = null;
    if (cat_id > 0) {
      const [rows] = await pool.query<CategoryRow[]>(
        "SELECT title FROM tbl_category WHERE id = :id LIMIT 1",
        { id: cat_id } as any,
      );
      cat_name = rows?.[0]?.title ? String(rows[0].title).trim() : null;
    }

    // sub_cat_name from tbl_product_category only
    const stored_sub_cat_id = product.sub_cat_id !== undefined && product.sub_cat_id !== null && String(product.sub_cat_id).trim() !== ""
      ? String(product.sub_cat_id).trim()
      : null;

    let sub_cat_id: string | null = null;
    let sub_cat_name = "";
    if (stored_sub_cat_id) {
      sub_cat_id = stored_sub_cat_id;
      const subIdInt = toInt(sub_cat_id, 0);
      if (subIdInt > 0) {
        const [pcRows] = await pool.query<ProductCategoryRow[]>(
          "SELECT name FROM tbl_product_category WHERE id = :id LIMIT 1",
          { id: subIdInt } as any,
        );
        sub_cat_name = pcRows?.[0]?.name ? String(pcRows[0].name).trim() : "";
      }
    }

    const title = cleanText(product.title);

    const productData: any = {};
    productData.id = product.id;
    productData.store_id = product.store_id;
    productData.cat_id = product.cat_id;
    productData.cat_name = cat_name;
    productData.sub_cat_id = sub_cat_id;
    productData.sub_cat_name = sub_cat_name;
    productData.title = title;
    productData.img = product.img;
    productData.product_images = product.product_images ? (JSON.parse(String(product.product_images)) ?? []) : [];
    productData.description = cleanDescription(product.description);
    productData.status = product.status;
    productData.about_product = parseKeyValueLines(product.about_product);
    productData.product_information = parseKeyValueLines(product.product_information);
    productData.fssai_lic = product.fssai_lic ?? null;

    // Attributes
    const [attrRows] = await pool.query<AttrRow[]>(
      `
      SELECT *
      FROM tbl_product_attribute
      WHERE product_id = :product_id
        AND store_id = :store_id
        AND status = 1
      ORDER BY id ASC
      `,
      {
        product_id: Number(product.id),
        store_id,
      } as any,
    );

    const attributes: any[] = [];
    for (const attr of attrRows ?? []) {
      attributes.push({
        attribute_id: String(attr.id),
        product_id: String(attr.product_id),
        normal_price: number_format(Number(attr.normal_price ?? 0)),
        subscribe_price: number_format(Number(attr.subscribe_price ?? 0)),
        title: cleanText(attr.title),
        product_discount_amt: number_format(Number(attr.discount ?? 0)),
        product_discount: number_format(Number(attr.discount ?? 0)),
        discounted_price: number_format(Number(attr.discounted_price ?? 0)),
        Product_Out_Stock: String(attr.out_of_stock ?? ""),
        subscription_required: String(attr.subscription_required ?? ""),
        attr_image: attr.attr_image ?? "",
        status: String(attr.status ?? ""),
      });
    }
    productData.attributes = attributes;
    productData.attribute_count = attributes.length;

    productList.push(productData);
  }

  if (!productList.length) {
    return {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "No products found",
      total: 0,
      page,
      limit,
      total_pages: 0,
      productdata: [],
    };
  }

  return {
    ResponseCode: "200",
    Result: "true",
    ResponseMsg: "Products found successfully",
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    productdata: productList,
  };
}

function number_format(n: number) {
  if (!Number.isFinite(n)) n = 0;
  return n.toFixed(0);
}

