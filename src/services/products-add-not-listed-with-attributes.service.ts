import fs from "fs/promises";
import { pool } from "../db/mysql";
import { useProductSchemaV2, useStoresTable } from "../config/schema";
import { resolveStoreNumericId } from "../utils/resolve-store-id";
import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import {
  collectAttributesInput,
  isHttpUrl,
  parseAttributePricing,
  resolveAndSaveImage,
  resolveAttrImage,
  resolveStoredImageAbsPath,
  sanitizeUtf8LikePhp,
  s,
  toAboutProductString,
  toProductInformationString,
} from "./products-with-attributes.shared";
import {
  insertProductV2,
  insertVariantInventoryV2,
  resolveVariantStockFromAttr,
  type ProductV2Extras,
} from "./product-v2.shared";

type StorePlanRow = RowDataPacket & { plan_id: number | string | null };
type PlanRow = RowDataPacket & {
  id: number;
  plan_title: string | null;
  price: string | number | null;
  product_limit: number;
};
type ProductCountRow = RowDataPacket & { total: number };

function buildNotListedFields(data: Record<string, unknown>, mainImagePath: string, productImages: string[]) {
  const title = sanitizeUtf8LikePhp(s(data.title));
  const description =
    data.description !== undefined && data.description !== null && s(data.description) !== ""
      ? sanitizeUtf8LikePhp(s(data.description))
      : title;

  const sub_cat_id_raw = data.sub_cat_id !== undefined ? s(data.sub_cat_id) : "";
  const sub_cat_id = sub_cat_id_raw && sub_cat_id_raw.toLowerCase() !== "null" ? sub_cat_id_raw : null;

  const about_product_raw = data.about_product !== undefined ? toAboutProductString(data.about_product) : "";
  const about_product = about_product_raw ? about_product_raw.replace(/[^\x20-\x7E\x0A\x0D\x09]/g, "").trim() : null;

  const product_information_raw =
    data.product_information !== undefined ? toProductInformationString(data.product_information) : "";
  const product_information = product_information_raw ? sanitizeUtf8LikePhp(product_information_raw) : null;

  const fssai_lic = data.fssai_lic !== undefined && s(data.fssai_lic) !== "" ? s(data.fssai_lic) : null;
  const productImagesJson = productImages.length ? JSON.stringify(productImages) : null;

  return {
    img: mainImagePath,
    status: s(data.status) || "0",
    description,
    title,
    cat_id: s(data.cat_id),
    sub_cat_id,
    product_images: productImagesJson,
    about_product,
    product_information,
    fssai_lic,
    loose_product: 1,
    approval_status: "pending",
  };
}

async function insertProductNotListedLegacy(
  fields: ReturnType<typeof buildNotListedFields>,
  store_id: string,
): Promise<number> {
  const columns = [
    "img",
    "status",
    "store_id",
    "description",
    "title",
    "cat_id",
    "loose_product",
    "approval_status",
    "sub_cat_id",
    "product_images",
    "about_product",
    "product_information",
    "fssai_lic",
  ];
  const params = { ...fields, store_id };
  const placeholders = columns.map((c) => `:${c}`).join(", ");
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO tbl_product (${columns.join(", ")}) VALUES (${placeholders})`,
    params as any,
  );
  return Number(result.insertId);
}

function toProductV2Extras(
  fields: ReturnType<typeof buildNotListedFields>,
  galleryPaths: string[],
): ProductV2Extras {
  return {
    cat_id: fields.cat_id,
    sub_cat_id: fields.sub_cat_id,
    about_product: fields.about_product,
    product_information: fields.product_information,
    fssai_lic: fields.fssai_lic,
    product_images: fields.product_images,
    galleryPaths,
  };
}

async function insertAttributeNotListedLegacy(
  attr: Record<string, unknown>,
  product_id: number,
  store_id: string,
  productImagePath: string,
): Promise<number> {
  const pricing = parseAttributePricing(attr);
  const attr_image = await resolveAttrImage(attr, productImagePath);

  const [result] = await pool.query<ResultSetHeader>(
    `
    INSERT INTO tbl_product_attribute
    (
      product_id, normal_price, title, discount, out_of_stock,
      subscribe_price, subscription_required, store_id, attr_image,
      discounted_price, status, approval_status
    )
    VALUES
    (
      :product_id, :normal_price, :title, :discount, 0,
      :subscribe_price, :subscription_required, :store_id, :attr_image,
      :discounted_price, 0, 'pending'
    )
    `,
    {
      product_id,
      normal_price: pricing.mprice,
      title: pricing.mtype,
      discount: String(pricing.flat_discount),
      subscribe_price: pricing.sprice,
      subscription_required: pricing.srequire,
      store_id,
      attr_image,
      discounted_price: pricing.discounted_price,
    } as any,
  );
  return Number(result.insertId);
}

async function insertAttributeNotListedV2(
  attr: Record<string, unknown>,
  product_id: number,
  storeIdNum: number,
  productImagePath: string,
): Promise<number> {
  const pricing = parseAttributePricing(attr);
  const attr_image = await resolveAttrImage(attr, productImagePath);

  const [vResult] = await pool.query<ResultSetHeader>(
    `
    INSERT INTO product_variants (
      product_id, variant_name, variant_image_url, status, is_deleted, approval_status
    )
    VALUES (:product_id, :title, :attr_image, 0, 0, 'pending')
    `,
    {
      product_id,
      title: pricing.mtype,
      attr_image,
    } as any,
  );
  const variantId = Number(vResult.insertId);

  await pool.query(
    `
    INSERT INTO product_pricing (product_id, variant_id, mrp, selling_price, discount_amount, is_active)
    VALUES (:product_id, :variant_id, :mrp, :selling_price, :discount_amount, 1)
    `,
    {
      product_id,
      variant_id: variantId,
      mrp: pricing.normal,
      selling_price: pricing.discounted_price,
      discount_amount: pricing.flat_discount,
    } as any,
  );

  await pool.query(
    `
    INSERT INTO product_inventory (product_id, variant_id, store_id, is_out_of_stock)
    VALUES (:product_id, :variant_id, :store_id, :is_out_of_stock)
    `,
    {
      product_id,
      variant_id: variantId,
      store_id: storeIdNum,
      is_out_of_stock: pricing.isOutOfStock,
    } as any,
  );

  return variantId;
}

async function resolveMainImage(imgInput: string) {
  if (isHttpUrl(imgInput) || imgInput.includes("data:image")) {
    const saved = await resolveAndSaveImage(imgInput, "images/product");
    if (!saved) {
      return { error: isHttpUrl(imgInput) ? "Unable to fetch image from URL" : "Invalid image data" } as const;
    }
    return { relPath: saved.relPath, absPath: saved.absPath } as const;
  }
  return { relPath: imgInput, absPath: resolveStoredImageAbsPath(imgInput) } as const;
}

export async function productsAddNotListedWithAttributesService(
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!s(data?.store_id)) return { ResponseCode: "401", Result: "false", ResponseMsg: "store_id is required" };
  if (!s(data?.title)) return { ResponseCode: "401", Result: "false", ResponseMsg: "title is required" };
  if (!s(data?.cat_id)) return { ResponseCode: "401", Result: "false", ResponseMsg: "cat_id is required" };
  if (!s(data?.img)) return { ResponseCode: "401", Result: "false", ResponseMsg: "img is required" };

  const storeIdNum = (await resolveStoreNumericId(data.store_id)) ?? Number(s(data.store_id));
  if (!storeIdNum) {
    return { ResponseCode: "401", Result: "false", ResponseMsg: "Invalid store_id" };
  }

  const planCol = useStoresTable() ? "subscription_plan_id" : "plan_id";
  const planTable = useStoresTable() ? "stores" : "service_details";
  const [spRows] = await pool.query<StorePlanRow[]>(
    `SELECT ${planCol} AS plan_id FROM ${planTable} WHERE id = :id LIMIT 1`,
    { id: storeIdNum } as any,
  );
  const plan_id = spRows?.[0]?.plan_id ? Number(spRows[0].plan_id) : 1;

  const [planRows] = await pool.query<PlanRow[]>(
    "SELECT id, plan_title, price, product_limit FROM tbl_joining_plan WHERE id = :id LIMIT 1",
    { id: plan_id } as any,
  );
  const plan = planRows?.[0];
  const product_limit = plan?.product_limit ?? 0;

  const productTable = useProductSchemaV2() ? "products" : "tbl_product";
  const deletedCol = useProductSchemaV2()
    ? "(is_deleted = 0 OR is_deleted IS NULL)"
    : "(is_delete = 0 OR is_delete IS NULL)";

  const [cntRows] = await pool.query<ProductCountRow[]>(
    `SELECT COUNT(*) AS total FROM ${productTable} WHERE store_id = :store_id AND ${deletedCol}`,
    { store_id: storeIdNum } as any,
  );
  const current_count = Number(cntRows?.[0]?.total ?? 0);

  const limit_reached = product_limit > 0 && current_count >= product_limit;
  const plan_status = {
    can_add: !limit_reached,
    extra_charge: 0,
    plan_name: plan?.plan_title ?? "",
    limit: product_limit,
    current_count,
    plan_id,
    price: plan?.price ?? null,
  };

  if (limit_reached) {
    return {
      ResponseCode: "403",
      Result: "false",
      ResponseMsg: `Product limit reached for your ${plan_status.plan_name} (${plan_status.limit} products). Please upgrade your plan.`,
      plan_status,
    };
  }

  const imgInput = String(data.img);
  const mainResolved = await resolveMainImage(imgInput);
  if ("error" in mainResolved) {
    return { ResponseCode: "401", Result: "false", ResponseMsg: mainResolved.error };
  }

  const productImages: string[] = [];
  if (Array.isArray(data.product_images) && data.product_images.length) {
    for (const imgItem of data.product_images) {
      const input = String(imgItem ?? "");
      if (!input) continue;
      if (isHttpUrl(input) || input.includes("data:image")) {
        const saved = await resolveAndSaveImage(input, "images/product");
        if (saved) productImages.push(saved.relPath);
      }
    }
  }

  const fields = buildNotListedFields(data, mainResolved.relPath, productImages);
  const store_id = s(data.store_id);

  let product_id = 0;
  try {
    product_id = useProductSchemaV2()
      ? await insertProductV2(
          storeIdNum,
          {
            title: fields.title,
            img: fields.img,
            description: fields.description,
            status: Number(fields.status) || 0,
            is_loose_product: 1,
            approval_status: "pending",
          },
          toProductV2Extras(fields, productImages),
        )
      : await insertProductNotListedLegacy(fields, store_id);
  } catch (e) {
    try {
      if (mainResolved.absPath) await fs.unlink(mainResolved.absPath);
    } catch {
      /* ignore */
    }
    for (const rel of productImages) {
      try {
        await fs.unlink(resolveStoredImageAbsPath(rel));
      } catch {
        /* ignore */
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ResponseCode: "500",
      Result: "false",
      ResponseMsg: `Failed to add product: ${msg}`,
      sql_error: msg,
    };
  }

  const attributesInput = collectAttributesInput(data);
  const attribute_results: Record<string, unknown>[] = [];
  const attribute_ids: number[] = [];
  let allAttrSuccess = true;

  for (let index = 0; index < attributesInput.length; index++) {
    const attr = attributesInput[index];
    try {
      const attribute_id = useProductSchemaV2()
        ? await insertAttributeNotListedV2(attr, product_id, storeIdNum, mainResolved.relPath)
        : await insertAttributeNotListedLegacy(attr, product_id, store_id, mainResolved.relPath);

      attribute_ids.push(attribute_id);
      attribute_results.push({
        Result: "true",
        ResponseMsg: "Attribute added successfully",
        attribute_id,
        attribute_title: s(attr.title) || s(attr.mtype) || "Default",
        attribute_image_received: true,
        index,
      });
    } catch {
      allAttrSuccess = false;
      attribute_results.push({
        Result: "false",
        ResponseMsg: "Failed to add attribute",
        index,
      });
    }
  }

  if (allAttrSuccess) {
    return {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Product and attributes added successfully",
      product_id,
      store_id,
      attribute_ids,
      attribute_count: attribute_ids.length,
    };
  }

  return {
    ResponseCode: "200",
    Result: "true",
    ResponseMsg: "Product added; some attributes failed",
    product_id,
    store_id,
    attribute_results,
  };
}
