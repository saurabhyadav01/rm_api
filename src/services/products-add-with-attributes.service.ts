import fs from "fs/promises";
import path from "path";
import { pool } from "../db/mysql";
import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function saveImageFromUrl(url: string, outDir: string, allowedExt: string[]) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const buf = Buffer.from(await resp.arrayBuffer());
  const extFromUrl = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
  const ext = extFromUrl && allowedExt.includes(extFromUrl) ? extFromUrl : "jpg";
  const relPath = path.posix.join(outDir.replaceAll("\\", "/"), `${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`);
  const absPath = path.join(process.cwd(), relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
  return { relPath, absPath };
}

async function saveImageFromDataUri(dataUri: string, outDir: string) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.*)$/i.exec(dataUri);
  if (!m) return null;
  const ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  const b64 = m[2].replace(/ /g, "+");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) return null;
  const relPath = path.posix.join(outDir.replaceAll("\\", "/"), `${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`);
  const absPath = path.join(process.cwd(), relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
  return { relPath, absPath };
}

async function resolveAndSaveImage(input: string, outDir: string) {
  const allowedExt = ["png", "jpg", "jpeg", "webp"];
  if (isHttpUrl(input)) return await saveImageFromUrl(input, outDir, allowedExt);
  if (input.includes("data:image")) return await saveImageFromDataUri(input, outDir);
  return null;
}

function sanitizeUtf8LikePhp(v: string) {
  // Remove emojis / 4-byte
  v = v.replace(/[\u{10000}-\u{10FFFF}]/gu, "");
  // Remove narrow no-break space, zero width etc.
  v = v.replace(/[\u2000-\u200F\u2028-\u202F\u205F-\u206F\uFEFF]/gu, " ");
  // Remove control chars
  v = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  v = v.replace(/\s+/g, " ").trim();
  return v;
}

function toAboutProductString(input: unknown) {
  if (Array.isArray(input)) return input.map((x) => s(x)).filter(Boolean).join("\n");
  return s(input);
}

function toProductInformationString(input: unknown) {
  if (input && typeof input === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (s(k) && s(v)) out.push(`${s(k)}: ${s(v)}`);
    }
    return out.join("\n");
  }
  return s(input);
}

async function insertProduct(data: any, mainImagePath: string, productImages: string[]) {
  const status = s(data.status);
  const store_id = s(data.store_id);
  const titleRaw = sanitizeUtf8LikePhp(s(data.title));
  const title = titleRaw;
  const description = data.description !== undefined && data.description !== null && s(data.description) !== ""
    ? sanitizeUtf8LikePhp(s(data.description))
    : title;
  const cat_id = s(data.cat_id);

  const sub_cat_id_raw = data.sub_cat_id !== undefined ? s(data.sub_cat_id) : "";
  const sub_cat_id = sub_cat_id_raw && sub_cat_id_raw.toLowerCase() !== "null" ? sub_cat_id_raw : null;

  const about_product_raw = data.about_product !== undefined ? toAboutProductString(data.about_product) : "";
  const about_product = about_product_raw ? about_product_raw.replace(/[^\x20-\x7E\x0A\x0D\x09]/g, "").trim() : null;

  const product_information_raw = data.product_information !== undefined ? toProductInformationString(data.product_information) : "";
  const product_information = product_information_raw ? sanitizeUtf8LikePhp(product_information_raw) : null;

  const fssai_lic = data.fssai_lic !== undefined && s(data.fssai_lic) !== "" ? s(data.fssai_lic) : null;

  const productImagesJson = productImages.length ? JSON.stringify(productImages) : null;

  const columns: string[] = [
    "img",
    "status",
    "store_id",
    "description",
    "title",
    "cat_id",
    "sub_cat_id",
    "product_images",
    "about_product",
    "product_information",
    "fssai_lic",
  ];

  const params: Record<string, unknown> = {
    img: mainImagePath,
    status,
    store_id,
    description,
    title,
    cat_id,
    sub_cat_id,
    product_images: productImagesJson,
    about_product,
    product_information,
    fssai_lic,
  };

  const placeholders = columns.map((c) => `:${c}`).join(", ");
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO tbl_product (${columns.join(", ")}) VALUES (${placeholders})`,
    params as any,
  );
  return Number(result.insertId);
}

async function resolveAttrImage(attr: any, productImagePath: string) {
  const attrImageInput = s(attr?.attr_image) || s(attr?.image) || "";
  if (!attrImageInput) return productImagePath;
  if (isHttpUrl(attrImageInput) || attrImageInput.includes("data:image")) {
    const saved = await resolveAndSaveImage(attrImageInput, "images/product_attribute");
    return saved?.relPath ?? productImagePath;
  }
  return attrImageInput; // path/URL already
}

async function insertAttribute(attr: any, product_id: number, store_id: string, productImagePath: string) {
  const mprice = s(attr?.mprice) || "0";
  const sprice = s(attr?.sprice) || "0";
  const srequire = s(attr?.srequire) || "0";
  const mtype = s(attr?.title) || s(attr?.mtype) || "Default";
  const mdiscount = s(attr?.mdiscount) || "0";
  const mstock = s(attr?.mstock) || "1"; // not used in SQL per PHP (they set out_of_stock = 0)
  void mstock;
  const status = attr?.status !== undefined && attr?.status !== null && s(attr?.status) !== "" ? s(attr.status) : "1";

  const normal = Number(mprice) || 0;
  const flat_discount = Number(mdiscount) || 0;
  let discounted_price = Math.round(normal - flat_discount);
  if (discounted_price <= 0 && normal > 0) discounted_price = 1;

  const attr_image = await resolveAttrImage(attr, productImagePath);

  const [result] = await pool.query<ResultSetHeader>(
    `
    INSERT INTO tbl_product_attribute
    (
      product_id,
      normal_price,
      title,
      discount,
      out_of_stock,
      subscribe_price,
      subscription_required,
      store_id,
      attr_image,
      discounted_price,
      status
    )
    VALUES
    (
      :product_id,
      :normal_price,
      :title,
      :discount,
      0,
      :subscribe_price,
      :subscription_required,
      :store_id,
      :attr_image,
      :discounted_price,
      :status
    )
    `,
    {
      product_id,
      normal_price: mprice,
      title: mtype,
      discount: String(flat_discount),
      subscribe_price: sprice,
      subscription_required: srequire,
      store_id,
      attr_image,
      discounted_price,
      status,
    } as any,
  );

  return Number(result.insertId);
}

export async function productsAddWithAttributesService(data: any): Promise<Record<string, unknown>> {
  // Required checks (same messages)
  if (!s(data?.status)) return { ResponseCode: "401", Result: "false", ResponseMsg: "status is required" };
  if (!s(data?.store_id)) return { ResponseCode: "401", Result: "false", ResponseMsg: "store_id is required" };
  if (!s(data?.title)) return { ResponseCode: "401", Result: "false", ResponseMsg: "title is required" };
  if (!s(data?.cat_id)) return { ResponseCode: "401", Result: "false", ResponseMsg: "cat_id is required" };
  if (!s(data?.img)) return { ResponseCode: "401", Result: "false", ResponseMsg: "img is required" };

  // Plan limit check using tbl_joining_plan (like PlanHelper).
  // Assumption: store_id refers to service_details.id and service_details.plan_id maps to tbl_joining_plan.id
  type StorePlanRow = RowDataPacket & { plan_id: number | string | null };
  type PlanRow = RowDataPacket & { id: number; product_limit: number; plan_title: string | null; price: string | number | null };
  type ProductCountRow = RowDataPacket & { total: number };

  const storeIdNum = Number(s(data.store_id));
  const [spRows] = await pool.query<StorePlanRow[]>(
    "SELECT plan_id FROM service_details WHERE id = :id LIMIT 1",
    { id: storeIdNum } as any,
  );
  const plan_id = spRows?.[0]?.plan_id ? Number(spRows[0].plan_id) : 1;

  const [planRows] = await pool.query<PlanRow[]>(
    "SELECT id, plan_title, price, product_limit FROM tbl_joining_plan WHERE id = :id LIMIT 1",
    { id: plan_id } as any,
  );
  const plan = planRows?.[0];
  const product_limit = plan?.product_limit ?? 0;

  const [cntRows] = await pool.query<ProductCountRow[]>(
    `
    SELECT COUNT(*) AS total
    FROM tbl_product
    WHERE store_id = :store_id
      AND (is_delete = 0 OR is_delete IS NULL)
    `,
    { store_id: storeIdNum } as any,
  );
  const current_count = Number(cntRows?.[0]?.total ?? 0);

  const limit_reached = product_limit > 0 && current_count >= product_limit;
  const limit_message =
    limit_reached
      ? `Product limit reached (${current_count}/${product_limit})`
      : `Can add product (${current_count}/${product_limit || "unlimited"})`;

  const plan_status = {
    limit_reached,
    limit_message,
    plan_id,
    product_limit,
    current_count,
    plan_title: plan?.plan_title ?? null,
    price: plan?.price ?? null,
  };

  if (plan_status.limit_reached) {
    return {
      ResponseCode: "403",
      Result: "false",
      ResponseMsg: plan_status.limit_message,
      plan_status,
    };
  }

  // Save main image
  const imgInput = String(data.img);
  let mainSaved = null as null | { relPath: string; absPath: string };
  if (isHttpUrl(imgInput) || imgInput.includes("data:image")) {
    mainSaved = await resolveAndSaveImage(imgInput, "images/product");
    if (!mainSaved) {
      return { ResponseCode: "401", Result: "false", ResponseMsg: isHttpUrl(imgInput) ? "Unable to fetch image from URL" : "Invalid image data" };
    }
  } else {
    // If plain path provided, accept as-is
    mainSaved = { relPath: imgInput, absPath: path.join(process.cwd(), imgInput) };
  }

  // Save product_images (optional)
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

  let product_id = 0;
  try {
    product_id = await insertProduct(data, mainSaved.relPath, productImages);
  } catch (e) {
    // On failure, try to remove saved images like PHP does
    try {
      if (mainSaved?.absPath) await fs.unlink(mainSaved.absPath);
    } catch {}
    for (const rel of productImages) {
      try {
        await fs.unlink(path.join(process.cwd(), rel));
      } catch {}
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ResponseCode: "500",
      Result: "false",
      ResponseMsg: `Failed to add product: ${msg}`,
      sql_error: msg,
      sql_query: "INSERT INTO tbl_product ...",
    };
  }

  const store_id = s(data.store_id);

  // Attributes input
  let attributesInput: any[] = [];
  if (Array.isArray(data.attributes) && data.attributes.length) {
    attributesInput = data.attributes;
  } else {
    attributesInput = [
      {
        mprice: data.mprice ?? "0",
        sprice: data.sprice ?? "0",
        title: data.mtype ?? data.attr_title ?? "Default",
        mdiscount: data.mdiscount ?? "0",
        mstock: data.mstock ?? "1",
        srequire: data.srequire ?? "0",
      },
    ];
  }

  const attribute_results: any[] = [];
  const attribute_ids: number[] = [];
  let allAttrSuccess = true;

  for (let index = 0; index < attributesInput.length; index++) {
    const attr = attributesInput[index];
    try {
      const attribute_id = await insertAttribute(attr, product_id, store_id, mainSaved.relPath);
      attribute_ids.push(attribute_id);
      attribute_results.push({
        Result: "true",
        ResponseMsg: "Attribute added successfully",
        attribute_id,
        attribute_title: s(attr?.title) || s(attr?.mtype) || "Default",
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

