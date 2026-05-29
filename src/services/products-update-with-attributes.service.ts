import fs from "fs/promises";
import { pool } from "../db/mysql";
import { useProductSchemaV2 } from "../config/schema";
import {
  collectAttributesInput,
  parseAttributePricing,
  resolveAndSaveImage,
  resolveAttrImage,
  resolveStoredImageAbsPath,
  sanitizeUtf8LikePhp,
  s,
  toAboutProductString,
  toProductInformationString,
  isHttpUrl,
} from "./products-with-attributes.shared";
import {
  insertVariantInventoryV2,
  resolveVariantStockFromAttr,
  updateProductV2Row,
  type ProductV2Extras,
} from "./product-v2.shared";
import { resolveStoreNumericId } from "../utils/resolve-store-id";
import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

type ProductRow = RowDataPacket & { id: number; store_id: number };

async function resolveMainImage(imgInput: string) {
  if (isHttpUrl(imgInput) || imgInput.includes("data:image")) {
    const saved = await resolveAndSaveImage(imgInput, "images/product");
    if (!saved) return { error: isHttpUrl(imgInput) ? "Unable to fetch image from URL" : "Invalid image data" };
    return { relPath: saved.relPath, absPath: saved.absPath };
  }
  return { relPath: imgInput, absPath: resolveStoredImageAbsPath(imgInput) };
}

function buildProductFields(data: Record<string, unknown>, mainImagePath: string, productImages: string[]) {
  const titleRaw = sanitizeUtf8LikePhp(s(data.title));
  const description =
    data.description !== undefined && data.description !== null && s(data.description) !== ""
      ? sanitizeUtf8LikePhp(s(data.description))
      : titleRaw;

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
    status: s(data.status),
    description,
    title: titleRaw,
    cat_id: s(data.cat_id),
    sub_cat_id,
    product_images: productImagesJson,
    about_product,
    product_information,
    fssai_lic,
  };
}

async function updateProductLegacy(
  product_id: number,
  store_id: string,
  fields: ReturnType<typeof buildProductFields>,
) {
  await pool.query(
    `
    UPDATE tbl_product
    SET
      img = :img,
      status = :status,
      description = :description,
      title = :title,
      cat_id = :cat_id,
      sub_cat_id = :sub_cat_id,
      product_images = :product_images,
      about_product = :about_product,
      product_information = :product_information,
      fssai_lic = :fssai_lic
    WHERE id = :product_id AND store_id = :store_id
    `,
    { ...fields, product_id, store_id } as any,
  );
}

function toProductV2Extras(
  fields: ReturnType<typeof buildProductFields>,
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
    replaceGalleryImages: true,
  };
}

async function upsertAttributeLegacy(
  attr: Record<string, unknown>,
  product_id: number,
  store_id: string,
  productImagePath: string,
) {
  const pricing = parseAttributePricing(attr);
  const attr_image = await resolveAttrImage(attr, productImagePath);
  const attribute_id = s(attr.attribute_id);

  if (attribute_id) {
    await pool.query(
      `
      UPDATE tbl_product_attribute
      SET
        normal_price = :normal_price,
        title = :title,
        discount = :discount,
        out_of_stock = :out_of_stock,
        subscribe_price = :subscribe_price,
        subscription_required = :subscription_required,
        attr_image = :attr_image,
        discounted_price = :discounted_price,
        status = :status
      WHERE id = :attribute_id AND product_id = :product_id AND store_id = :store_id
      `,
      {
        attribute_id: Number(attribute_id),
        product_id,
        store_id,
        normal_price: pricing.mprice,
        title: pricing.mtype,
        discount: String(pricing.flat_discount),
        out_of_stock: pricing.out_of_stock,
        subscribe_price: pricing.sprice,
        subscription_required: pricing.srequire,
        attr_image,
        discounted_price: pricing.discounted_price,
        status: pricing.status,
      } as any,
    );
    return Number(attribute_id);
  }

  const [result] = await pool.query<ResultSetHeader>(
    `
    INSERT INTO tbl_product_attribute
    (
      product_id, normal_price, title, discount, out_of_stock,
      subscribe_price, subscription_required, store_id, attr_image, discounted_price, status
    )
    VALUES
    (
      :product_id, :normal_price, :title, :discount, :out_of_stock,
      :subscribe_price, :subscription_required, :store_id, :attr_image, :discounted_price, :status
    )
    `,
    {
      product_id,
      normal_price: pricing.mprice,
      title: pricing.mtype,
      discount: String(pricing.flat_discount),
      out_of_stock: 0,
      subscribe_price: pricing.sprice,
      subscription_required: pricing.srequire,
      store_id,
      attr_image,
      discounted_price: pricing.discounted_price,
      status: pricing.status,
    } as any,
  );
  return Number(result.insertId);
}

async function upsertAttributeV2(
  attr: Record<string, unknown>,
  product_id: number,
  store_id: string,
  productImagePath: string,
) {
  const pricing = parseAttributePricing(attr);
  const attr_image = await resolveAttrImage(attr, productImagePath);
  const attribute_id = s(attr.attribute_id);
  const storeIdNum = Number(store_id);

  if (attribute_id) {
    const vid = Number(attribute_id);
    await pool.query(
      `
      UPDATE product_variants
      SET variant_name = :title, variant_image_url = :attr_image, status = :status
      WHERE id = :attribute_id AND product_id = :product_id
      `,
      {
        attribute_id: vid,
        product_id,
        title: pricing.mtype,
        attr_image,
        status: pricing.status,
      } as any,
    );

    await pool.query(
      `
      UPDATE product_pricing
      SET mrp = :mrp, selling_price = :selling_price, discount_amount = :discount_amount
      WHERE variant_id = :attribute_id
      `,
      {
        attribute_id: vid,
        mrp: pricing.normal,
        selling_price: pricing.discounted_price,
        discount_amount: pricing.flat_discount,
      } as any,
    );

    await pool.query(
      `
      UPDATE product_inventory
      SET is_out_of_stock = :is_out_of_stock
      WHERE variant_id = :attribute_id
      `,
      { attribute_id: vid, is_out_of_stock: pricing.isOutOfStock } as any,
    );

    return vid;
  }

  const [vResult] = await pool.query<ResultSetHeader>(
    `
    INSERT INTO product_variants (product_id, variant_name, variant_image_url, status, is_deleted)
    VALUES (:product_id, :title, :attr_image, :status, 0)
    `,
    {
      product_id,
      title: pricing.mtype,
      attr_image,
      status: pricing.status,
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

  const stock = resolveVariantStockFromAttr(attr);
  await insertVariantInventoryV2(product_id, variantId, stock);

  return variantId;
}

export async function productsUpdateWithAttributesService(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!s(data.product_id)) {
    return { ResponseCode: "401", Result: "false", ResponseMsg: "product_id is required" };
  }
  if (!s(data.status)) return { ResponseCode: "401", Result: "false", ResponseMsg: "status is required" };
  if (!s(data.store_id)) return { ResponseCode: "401", Result: "false", ResponseMsg: "store_id is required" };
  if (!s(data.title)) return { ResponseCode: "401", Result: "false", ResponseMsg: "title is required" };
  if (!s(data.cat_id)) return { ResponseCode: "401", Result: "false", ResponseMsg: "cat_id is required" };
  if (!s(data.img)) return { ResponseCode: "401", Result: "false", ResponseMsg: "img is required" };

  const product_id = Number(s(data.product_id));
  const store_id = s(data.store_id);
  const storeIdNum = (await resolveStoreNumericId(store_id)) ?? Number(store_id);

  const productTable = useProductSchemaV2() ? "products" : "tbl_product";
  const deletedCol = useProductSchemaV2() ? "(is_deleted = 0 OR is_deleted IS NULL)" : "(is_delete = 0 OR is_delete IS NULL)";

  const [existing] = await pool.query<ProductRow[]>(
    `SELECT id, store_id FROM ${productTable} WHERE id = :product_id AND store_id = :store_id AND ${deletedCol} LIMIT 1`,
    { product_id, store_id: storeIdNum } as any,
  );

  if (!existing?.length) {
    return {
      ResponseCode: "404",
      Result: "false",
      ResponseMsg: "Product not found for this store",
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
      } else {
        productImages.push(input);
      }
    }
  }

  const fields = buildProductFields(data, mainResolved.relPath, productImages);

  try {
    if (useProductSchemaV2()) {
      await updateProductV2Row(
        product_id,
        storeIdNum,
        {
          title: fields.title,
          img: fields.img,
          description: fields.description,
          status: Number(fields.status) || 1,
        },
        toProductV2Extras(fields, productImages),
      );
    } else {
      await updateProductLegacy(product_id, store_id, fields);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ResponseCode: "500",
      Result: "false",
      ResponseMsg: `Failed to update product: ${msg}`,
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
        ? await upsertAttributeV2(attr, product_id, store_id, mainResolved.relPath)
        : await upsertAttributeLegacy(attr, product_id, store_id, mainResolved.relPath);

      attribute_ids.push(attribute_id);
      attribute_results.push({
        Result: "true",
        ResponseMsg: s(attr.attribute_id) ? "Attribute updated successfully" : "Attribute added successfully",
        attribute_id,
        attribute_title: s(attr.title) || s(attr.mtype) || "Default",
        attribute_image_received: true,
        index,
      });
    } catch {
      allAttrSuccess = false;
      attribute_results.push({
        Result: "false",
        ResponseMsg: "Failed to update attribute",
        index,
      });
    }
  }

  if (allAttrSuccess) {
    return {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Product and attributes updated successfully",
      product_id,
      store_id,
      attribute_ids,
      attribute_count: attribute_ids.length,
    };
  }

  return {
    ResponseCode: "200",
    Result: "true",
    ResponseMsg: "Product updated; some attributes failed",
    product_id,
    store_id,
    attribute_results,
  };
}
