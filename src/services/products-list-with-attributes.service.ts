import { pool } from "../db/mysql";
import { useProductSchemaV2 } from "../config/schema";
import { fetchVariantsByProductId, mapVariantToLegacyAttribute } from "./product-v2.shared";
import { type RowDataPacket } from "mysql2/promise";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback: number) {
  const n = Number(s(v));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

type CountRow = RowDataPacket & { product_count?: number; attribute_total?: number };
type ProductRow = RowDataPacket & Record<string, any>;
type CategoryRow = RowDataPacket & { title: string | null };
type ProductCategoryRow = RowDataPacket & { name: string | null };
type AttrRow = RowDataPacket & Record<string, any>;

function cleanAggressive(v: unknown) {
  let t = String(v ?? "");
  if (!t) return "";
  t = t.replace(/<[^>]*>/g, "");
  let prev = "";
  let iterations = 0;
  while (prev !== t && iterations < 30) {
    prev = t;
    t = t.replace(/\\+'/g, "'").replace(/\\"+/g, '"').replace(/\\+/g, "");
    iterations++;
  }
  t = t.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\/g, "");
  return t.trim();
}

function cleanDescription(v: unknown) {
  let d = String(v ?? "");
  if (!d) return "";
  d = d.replace(/<[^>]*>/g, "");
  let prev = "";
  let iterations = 0;
  while (prev !== d && iterations < 30) {
    prev = d;
    d = d.replace(/\\+r?\\*n/gi, "\n").replace(/\\"+/g, '"').replace(/\\+'/g, "'").replace(/\r\n/g, "\n");
    iterations++;
  }
  d = d.replace(/\\+n/gi, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
  d = d.replace(/[\r\n]+/g, " ");
  d = d.replace(/\\/g, "");
  d = d.replace(/["'\u201c\u201d\u2018\u2019]/g, "");
  d = d.replace(/\s+/g, " ").trim();
  if (!d || /^\s*$/.test(d)) return "";
  return d;
}

function parseAboutProduct(v: unknown): string[] | null {
  let txt = String(v ?? "");
  if (!txt) return null;
  txt = txt.replace(/<[^>]*>/g, "");
  let prev = "";
  for (let i = 0; i < 30 && prev !== txt; i++) {
    prev = txt;
    txt = txt.replace(/\\+r?\\*n/gi, "\n").replace(/\\"+/g, '"').replace(/\\+'/g, "'").replace(/\r\n/g, "\n");
  }
  txt = txt.replace(/\\+n/gi, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
  txt = txt.replace(/\n{3,}/g, "\n\n");
  const lines = txt.split("\n").map((x) => x.trim()).filter(Boolean);
  return lines.length ? lines : null;
}

function parseProductInformationFiltered(v: unknown): Record<string, string> | null {
  let txt = String(v ?? "");
  if (!txt) return null;
  txt = txt.replace(/<[^>]*>/g, "");
  let prev = "";
  for (let i = 0; i < 30 && prev !== txt; i++) {
    prev = txt;
    txt = txt.replace(/\\+r?\\*n/gi, "\n").replace(/\\"+/g, '"').replace(/\\+'/g, "'").replace(/\r\n/g, "\n");
  }
  txt = txt.replace(/\\+n/gi, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
  txt = txt.replace(/\n{3,}/g, "\n\n");

  const lines = txt.split("\n").map((x) => x.trim()).filter(Boolean);
  const info: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) info[key] = value;
  }

  const review_keys = [
    "review",
    "reviews",
    "rating",
    "ratings",
    "customer_review",
    "customer_reviews",
    "user_review",
    "user_reviews",
    "total_rate",
    "rate_text",
    "review_date",
    "is_rate",
    "user_name",
    "user_img",
    "average_rating",
    "total_reviews",
  ];

  const filtered: Record<string, string> = {};
  for (const [k, v2] of Object.entries(info)) {
    const kl = k.toLowerCase();
    let isReview = false;
    for (const rk of review_keys) {
      if (kl.includes(rk)) {
        isReview = true;
        break;
      }
    }
    if (!isReview) filtered[k] = v2;
  }

  return Object.keys(filtered).length ? filtered : null;
}

function fmt0(n: number) {
  if (!Number.isFinite(n)) n = 0;
  return n.toFixed(0);
}

async function productsListWithAttributesV2(data: any): Promise<Record<string, unknown>> {
  const store_id_raw = data && data.store_id !== undefined ? s(data.store_id) : "";
  if (!store_id_raw) {
    return {
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "Something Went Wrong! Store ID is required.",
    };
  }
  const store_id = toInt(store_id_raw, 0);
  let page = data && data.page !== undefined ? toInt(data.page, 1) : 1;
  if (page < 1) page = 1;
  let limit = data && data.limit !== undefined ? toInt(data.limit, 20) : 20;
  if (limit < 20) limit = 20;
  const offset = (page - 1) * limit;

  const [pcRows] = await pool.query<CountRow[]>(
    `
    SELECT COUNT(*) AS product_count
    FROM products p
    WHERE p.store_id = :store_id
      AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      AND (p.status = 1 OR p.status = '1')
    `,
    { store_id } as any,
  );
  const product_count = Number(pcRows?.[0]?.product_count ?? 0);

  const [atRows] = await pool.query<CountRow[]>(
    `
    SELECT COUNT(*) AS attribute_total
    FROM product_variants v
    INNER JOIN products p ON p.id = v.product_id AND p.store_id = :store_id
    WHERE (p.is_deleted = 0 OR p.is_deleted IS NULL)
      AND (p.status = 1 OR p.status = '1')
      AND (v.is_deleted = 0 OR v.is_deleted IS NULL)
      AND v.deleted_at IS NULL
    `,
    { store_id } as any,
  );
  const attribute_total = Number(atRows?.[0]?.attribute_total ?? 0);

  const [products] = await pool.query<ProductRow[]>(
    `
    SELECT p.*
    FROM products p
    WHERE p.store_id = :store_id
      AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      AND (p.status = 1 OR p.status = '1')
    ORDER BY p.id DESC
    LIMIT :offset, :limit
    `,
    { store_id, offset, limit } as any,
  );

  const productList: any[] = [];
  for (const product of products ?? []) {
    const variants = await fetchVariantsByProductId(Number(product.id));
    const attributes = variants
      .sort((a, b) => Number(b.id) - Number(a.id))
      .map((v) => mapVariantToLegacyAttribute(v, { includeId: true }));

    productList.push({
      id: product.id,
      store_id: product.store_id,
      loose_product: String(product.is_loose_product ?? "") === "1",
      cat_id: product.cat_id ?? null,
      cat_name: null,
      sub_cat_id: product.sub_cat_id ?? null,
      sub_cat_name: "",
      title: cleanAggressive(product.title),
      img: product.primary_image_url ?? product.img ?? "",
      product_images: product.product_images ? JSON.parse(String(product.product_images)) : [],
      description: cleanDescription(product.description),
      status: product.status,
      about_product: parseAboutProduct(product.about_product),
      product_information: parseProductInformationFiltered(product.product_information),
      fssai_lic: product.fssai_lic ?? null,
      attributes,
    });
  }

  return {
    productdata: productList,
    page,
    limit,
    total: attribute_total,
    product_count,
    attribute_total,
    total_pages: limit > 0 ? Math.ceil(product_count / limit) : 0,
    ResponseCode: "200",
    Result: "true",
    ResponseMsg: "Product List with Multiple Attributes Loaded Successfully!",
  };
}

export async function productsListWithAttributesService(data: any): Promise<Record<string, unknown>> {
  if (useProductSchemaV2()) {
    return productsListWithAttributesV2(data);
  }

  const store_id_raw = data && data.store_id !== undefined ? s(data.store_id) : "";
  if (!store_id_raw) {
    return {
      ResponseCode: "401",
      Result: "false",
      ResponseMsg: "Something Went Wrong! Store ID is required.",
    };
  }

  const store_id = toInt(store_id_raw, 0);

  let page = data && data.page !== undefined ? toInt(data.page, 1) : 1;
  if (page < 1) page = 1;
  let limit = data && data.limit !== undefined ? toInt(data.limit, 20) : 20;
  if (limit < 20) limit = 20;
  const offset = (page - 1) * limit;

  // Product count (active products)
  const [pcRows] = await pool.query<CountRow[]>(
    `
    SELECT COUNT(*) AS product_count
    FROM tbl_product
    WHERE store_id = :store_id
      AND (is_delete = 0 OR is_delete IS NULL)
      AND (status = 1 OR status = '1')
    `,
    { store_id } as any,
  );
  const product_count = Number(pcRows?.[0]?.product_count ?? 0);

  // Attribute total (variants count)
  const [atRows] = await pool.query<CountRow[]>(
    `
    SELECT COUNT(*) AS attribute_total
    FROM tbl_product_attribute pa
    INNER JOIN tbl_product p ON p.id = pa.product_id AND p.store_id = pa.store_id
    WHERE pa.store_id = :store_id
      AND (p.is_delete = 0 OR p.is_delete IS NULL)
      AND (p.status = 1 OR p.status = '1')
    `,
    { store_id } as any,
  );
  const attribute_total = Number(atRows?.[0]?.attribute_total ?? 0);
  const total = attribute_total;

  const [products] = await pool.query<ProductRow[]>(
    `
    SELECT *
    FROM tbl_product
    WHERE store_id = :store_id
      AND (is_delete = 0 OR is_delete IS NULL)
      AND (status = 1 OR status = '1')
    ORDER BY id DESC
    LIMIT :offset, :limit
    `,
    { store_id, offset, limit } as any,
  );

  const productList: any[] = [];
  const seen: Record<number, boolean> = {};

  for (const product of products ?? []) {
    const productId = Number(product.id);
    if (seen[productId]) continue;
    seen[productId] = true;

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

    const stored_sub_cat_id =
      product.sub_cat_id !== undefined && product.sub_cat_id !== null && String(product.sub_cat_id).trim() !== ""
        ? String(product.sub_cat_id).trim()
        : null;

    let sub_cat_id: string | null = null;
    let sub_cat_name = "";
    if (stored_sub_cat_id) {
      sub_cat_id = stored_sub_cat_id;
      const subIdInt = toInt(sub_cat_id, 0);
      if (subIdInt > 0) {
        const [pc] = await pool.query<ProductCategoryRow[]>(
          "SELECT name FROM tbl_product_category WHERE id = :id LIMIT 1",
          { id: subIdInt } as any,
        );
        sub_cat_name = pc?.[0]?.name ? String(pc[0].name).trim() : "";
      }
    }

    const productData: any = {};
    productData.id = product.id;
    productData.store_id = product.store_id;
    productData.loose_product = String(product.loose_product ?? "") === "1";
    productData.cat_id = product.cat_id;
    productData.cat_name = cat_name;
    productData.sub_cat_id = sub_cat_id;
    productData.sub_cat_name = sub_cat_name;
    productData.title = cleanAggressive(product.title);
    productData.img = product.img;
    productData.product_images = product.product_images ? (JSON.parse(String(product.product_images)) ?? []) : [];
    productData.description = cleanDescription(product.description);
    productData.status = product.status;
    productData.about_product = parseAboutProduct(product.about_product);
    productData.product_information = parseProductInformationFiltered(product.product_information);
    productData.fssai_lic = product.fssai_lic ?? null;

    // Attributes (multiple) — order DESC (matches PHP)
    const [attrRows] = await pool.query<AttrRow[]>(
      `
      SELECT *
      FROM tbl_product_attribute
      WHERE product_id = :product_id
        AND store_id = :store_id
      ORDER BY id DESC
      `,
      { product_id: productId, store_id } as any,
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
        const actual_reduction = normal - discountedPriceVal;
        discount_percentage = Math.round((actual_reduction / normal) * 100);
      }

      attributes.push({
        id: attr.id,
        product_id: attr.product_id,
        title: cleanAggressive(attr.title),
        normal_price: fmt0(normal),
        subscribe_price: attr.subscribe_price !== undefined ? fmt0(Number(attr.subscribe_price ?? 0)) : "0",
        discount: fmt0(disc),
        discount_percentage: String(discount_percentage),
        discount_amount: fmt0(disc),
        discounted_price: fmt0(discountedPriceVal),
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
    product_count,
    attribute_total,
    total_pages: limit > 0 ? Math.ceil(product_count / limit) : 0,
    ResponseCode: "200",
    Result: "true",
    ResponseMsg: "Product List with Multiple Attributes Loaded Successfully!",
  };
}

