import { pool } from "../db/mysql";
import { useProductSchemaV2 } from "../config/schema";
import {
  fetchProductImagesMap,
  fetchVariantsByProductIds,
  mapVariantToLegacyAttribute,
  PRODUCT_TITLE_SQL,
  productImageFromRow,
  productTitleFromRow,
  resolveProductImagesForList,
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
  t = t.replace(/<[^>]*>/g, "");
  // mimic limited unescape loop in PHP (max 10)
  for (let i = 0; i < 10; i++) {
    const prev = t;
    t = t.replace(/\\+'?/g, "'").replace(/\\"+/g, '"').replace(/\\+/g, "");
    if (prev === t) break;
  }
  return t.trim();
}

function cleanDescription(v: unknown) {
  let d = String(v ?? "");
  if (!d) return "";
  d = d.replace(/<[^>]*>/g, "");
  for (let i = 0; i < 10; i++) {
    const prev = d;
    d = d.replace(/\\+r?\\*n/gi, "\n").replace(/\\"+/g, '"').replace(/\\+'/g, "'"); // rough match
    if (prev === d) break;
  }
  d = d.replace(/[\r\n]+/g, " ");
  d = d.replace(/\\+/g, "");
  d = d.replace(/\s+/g, " ").trim();
  return d;
}

function parseAboutProductLines(v: unknown): string[] | null {
  const txt = String(v ?? "");
  if (!txt) return null;
  const clean = txt.replace(/<[^>]*>/g, "");
  const lines = clean.split("\n").map((x) => x.trim()).filter(Boolean);
  return lines.length ? lines : null;
}

function parseProductInformation(v: unknown): Record<string, string> | null {
  const txt = String(v ?? "");
  if (!txt) return null;
  const clean = txt.replace(/<[^>]*>/g, "");
  const lines = clean.split("\n").map((x) => x.trim()).filter(Boolean);
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

async function looseProductsSearchV2(data: any): Promise<Record<string, unknown>> {
  const keyword = data && data.keyword !== undefined ? s(data.keyword) : "";
  let page = data && data.page !== undefined ? toInt(data.page, 1) : 1;
  if (page < 1) page = 1;
  let limit = data && data.limit !== undefined ? toInt(data.limit, 20) : 20;
  if (limit < 20) limit = 20;
  const offset = (page - 1) * limit;

  const whereParts = [
    "(COALESCE(p.is_loose_product, 0) = 1)",
    "(p.is_deleted = 0 OR p.is_deleted IS NULL)",
  ];
  const params: Record<string, unknown> = {};
  if (keyword) {
    whereParts.push(`${PRODUCT_TITLE_SQL} LIKE :kw`);
    params.kw = `%${keyword}%`;
  }
  const whereClause = `WHERE ${whereParts.join(" AND ")}`;

  const [countRows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total FROM products p ${whereClause}`,
    params as any,
  );
  const total = Number(countRows?.[0]?.total ?? 0);

  const [products] = await pool.query<ProductRow[]>(
    `SELECT p.* FROM products p ${whereClause} ORDER BY p.id DESC LIMIT :offset, :limit`,
    { ...params, offset, limit } as any,
  );

  const productIds = (products ?? []).map((p) => Number(p.id));
  const [imagesMap, variantsMap] = await Promise.all([
    fetchProductImagesMap(productIds),
    fetchVariantsByProductIds(productIds),
  ]);

  const productList: any[] = [];
  for (const product of products ?? []) {
    const variants = (variantsMap.get(Number(product.id)) ?? [])
      .sort((a, b) => Number(b.id) - Number(a.id));
    const attributes = variants.map((v) => mapVariantToLegacyAttribute(v, { includeId: true }));

    productList.push({
      id: product.id,
      store_id: product.store_id,
      cat_id: product.cat_id ?? product.category_id ?? null,
      cat_name: null,
      sub_cat_id: product.sub_cat_id ?? product.subcategory_id ?? null,
      sub_cat_name: "",
      title: cleanText(productTitleFromRow(product)),
      loose_product: 1,
      img: productImageFromRow(product),
      product_images: resolveProductImagesForList(Number(product.id), product, imagesMap),
      description: cleanDescription(product.description),
      status: product.status,
      about_product: parseAboutProductLines(product.about_product),
      product_information: parseProductInformation(product.product_information),
      fssai_lic: product.fssai_lic ?? null,
      attributes,
    });
  }

  return {
    productdata: productList,
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
    ResponseCode: "200",
    Result: "true",
    ResponseMsg: "Products Searched Successfully!",
  };
}

export async function looseProductsSearchService(data: any): Promise<Record<string, unknown>> {
  if (useProductSchemaV2()) {
    return looseProductsSearchV2(data);
  }

  const keyword = data && data.keyword !== undefined ? s(data.keyword) : "";

  let page = data && data.page !== undefined ? toInt(data.page, 1) : 1;
  if (page < 1) page = 1;

  let limit = data && data.limit !== undefined ? toInt(data.limit, 20) : 20;
  if (limit < 20) limit = 20;

  const offset = (page - 1) * limit;

  const whereParts: string[] = ["loose_product = 1", "is_delete = 0"];
  const params: Record<string, unknown> = {};

  if (keyword) {
    whereParts.push("title LIKE :kw");
    params.kw = `%${keyword}%`;
  }

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
    const current_product_store_id = Number(product.store_id ?? 0);

    // category names
    const cat_id = product.cat_id ? Number(product.cat_id) : 0;
    let cat_name: string | null = null;
    if (cat_id > 0) {
      const [rows] = await pool.query<CategoryRow[]>(
        "SELECT title FROM tbl_category WHERE id = :id LIMIT 1",
        { id: cat_id } as any,
      );
      cat_name = rows?.[0]?.title ? String(rows[0].title).trim() : null;
    }

    let sub_cat_name = "";
    const stored_sub_cat_id =
      product.sub_cat_id !== undefined && product.sub_cat_id !== null && String(product.sub_cat_id).trim() !== ""
        ? String(product.sub_cat_id).trim()
        : null;
    if (stored_sub_cat_id) {
      const subIdInt = toInt(stored_sub_cat_id, 0);
      if (subIdInt > 0) {
        const [pcRows] = await pool.query<ProductCategoryRow[]>(
          "SELECT name FROM tbl_product_category WHERE id = :id LIMIT 1",
          { id: subIdInt } as any,
        );
        sub_cat_name = pcRows?.[0]?.name ? String(pcRows[0].name).trim() : "";
      }
    }

    const productData: any = {};
    productData.id = product.id;
    productData.store_id = product.store_id;
    productData.cat_id = product.cat_id;
    productData.cat_name = cat_name;
    productData.sub_cat_id = product.sub_cat_id;
    productData.sub_cat_name = sub_cat_name;
    productData.title = cleanText(product.title);
    productData.loose_product = product.loose_product;
    productData.img = product.img;
    productData.product_images = product.product_images ? (JSON.parse(String(product.product_images)) ?? []) : [];
    productData.description = cleanDescription(product.description);
    productData.status = product.status;
    productData.about_product = parseAboutProductLines(product.about_product);
    productData.product_information = parseProductInformation(product.product_information);
    productData.fssai_lic = product.fssai_lic ?? null;

    // Attributes: use store_id from product record; order DESC; no status filter (matches PHP)
    const [attrRows] = await pool.query<AttrRow[]>(
      `
      SELECT *
      FROM tbl_product_attribute
      WHERE product_id = :product_id
        AND store_id = :store_id
      ORDER BY id DESC
      `,
      { product_id: Number(product.id), store_id: current_product_store_id } as any,
    );

    const attributes: any[] = [];
    for (const attr of attrRows ?? []) {
      const normal = Number(attr.normal_price ?? 0);
      const disc = Number(attr.discount ?? 0);
      const out_of_stock = attr.out_of_stock !== undefined ? Number(attr.out_of_stock) : 1;
      const is_stock = out_of_stock === 0 ? 1 : 0;

      let discountedPriceVal = normal - disc;
      if (discountedPriceVal <= 0 && normal > 0) discountedPriceVal = 1;

      let discount_percentage = 0;
      if (normal > 0) {
        discount_percentage = Math.round(((normal - discountedPriceVal) / normal) * 100);
      }

      attributes.push({
        id: attr.id,
        product_id: attr.product_id,
        title: cleanText(attr.title),
        normal_price: normal.toFixed(0),
        subscribe_price: attr.subscribe_price !== undefined ? Number(attr.subscribe_price ?? 0).toFixed(0) : "0",
        discount: disc.toFixed(0),
        discount_percentage: String(discount_percentage),
        discount_amount: disc.toFixed(0),
        discounted_price: discountedPriceVal.toFixed(0),
        is_stock,
        subscription_required: attr.subscription_required,
        attr_image: attr.attr_image ?? "",
      });
    }
    productData.attributes = attributes;

    productList.push(productData);
  }

  return {
    productdata: productList,
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
    ResponseCode: "200",
    Result: "true",
    ResponseMsg: "Products Searched Successfully!",
  };
}

