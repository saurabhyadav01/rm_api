import { pool } from "../db/mysql";
import { getPublicFileUrl } from "../config/uploads";
import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Relative `images/...` paths → public URL; absolute http(s) URLs unchanged. */
export function resolveProductImagePublicUrl(imageUrl: unknown): string {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return "";
  if (isHttpUrl(raw)) return raw;
  return getPublicFileUrl(raw);
}

export const PRODUCT_NOT_DELETED = `(p.is_deleted = 0 OR p.is_deleted IS NULL)`;
export const PRODUCT_ACTIVE = `${PRODUCT_NOT_DELETED} AND (p.status = 1 OR p.status = '1')`;

/** DB column for product title (microservices: `name`, legacy: `title`). */
export const PRODUCT_TITLE_SQL = "COALESCE(p.name, p.title)";

type VariantRow = RowDataPacket & Record<string, unknown>;

export type ProductCategoryInfo = {
  cat_id: number | string | null;
  cat_name: string | null;
  sub_cat_id: string | null;
  sub_cat_name: string;
};

type CategoryMappingRow = RowDataPacket & {
  product_id: number;
  sub_cat_id: number | null;
  sub_cat_name: string | null;
  cat_id: number | null;
  cat_name: string | null;
};

/**
 * v2 schema: categories via product_category_mappings → subcategories → categories.
 * (products table has no cat_id column in normalized DB.)
 */
export async function fetchProductCategoryMap(
  productIds: number[],
): Promise<Map<number, ProductCategoryInfo>> {
  const map = new Map<number, ProductCategoryInfo>();
  const ids = productIds.map((id) => Number(id)).filter((id) => id > 0);
  if (!ids.length) return map;

  const idList = ids.join(",");

  const [rows] = await pool.query<CategoryMappingRow[]>(
    `
    SELECT
      pcm.product_id,
      pcm.category_id AS sub_cat_id,
      sc.name AS sub_cat_name,
      sc.category_id AS cat_id,
      c.name AS cat_name
    FROM product_category_mappings pcm
    LEFT JOIN subcategories sc ON sc.id = pcm.category_id
      AND (sc.is_deleted = 0 OR sc.is_deleted IS NULL)
    LEFT JOIN categories c ON c.id = sc.category_id
      AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
    WHERE pcm.product_id IN (${idList})
      AND (pcm.status = 1 OR pcm.status IS NULL)
    ORDER BY pcm.product_id ASC, pcm.is_primary DESC, pcm.id ASC
    `,
  );

  for (const row of rows ?? []) {
    const pid = Number(row.product_id);
    if (map.has(pid)) continue;
    map.set(pid, {
      cat_id: row.cat_id ?? null,
      cat_name: row.cat_name ? String(row.cat_name).trim() : null,
      sub_cat_id: row.sub_cat_id != null ? String(row.sub_cat_id) : null,
      sub_cat_name: row.sub_cat_name ? String(row.sub_cat_name).trim() : "",
    });
  }

  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) {
    const missingList = missing.join(",");
    const [legacyRows] = await pool.query<CategoryMappingRow[]>(
      `
      SELECT
        p.id AS product_id,
        p.sub_cat_id AS sub_cat_id,
        sc.name AS sub_cat_name,
        sc.category_id AS cat_id,
        c.name AS cat_name
      FROM products p
      LEFT JOIN subcategories sc ON sc.id = p.sub_cat_id
      LEFT JOIN categories c ON c.id = sc.category_id
      WHERE p.id IN (${missingList})
        AND p.sub_cat_id IS NOT NULL
        AND CAST(p.sub_cat_id AS UNSIGNED) > 0
      `,
    ).catch(() => [[] as CategoryMappingRow[]]);

    for (const row of legacyRows ?? []) {
      const pid = Number(row.product_id);
      if (map.has(pid)) continue;
      map.set(pid, {
        cat_id: row.cat_id ?? null,
        cat_name: row.cat_name ? String(row.cat_name).trim() : null,
        sub_cat_id: row.sub_cat_id != null ? String(row.sub_cat_id) : null,
        sub_cat_name: row.sub_cat_name ? String(row.sub_cat_name).trim() : "",
      });
    }
  }

  return map;
}

export function fmt0(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(0);
}

export function productTitleFromRow(product: Record<string, unknown>): string {
  return String(product.name ?? product.title ?? "").trim();
}

export function productImageFromRow(product: Record<string, unknown>): string {
  const raw = String(product.primary_image_url ?? product.img ?? product.image_url ?? "").trim();
  return resolveProductImagePublicUrl(raw);
}

type ProductImageRow = RowDataPacket & {
  product_id: number;
  image_url: string | null;
};

/** Gallery images from normalized `product_images` table (v2 schema). */
export async function fetchProductImagesMap(productIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  const ids = productIds.map((id) => Number(id)).filter((id) => id > 0);
  if (!ids.length) return map;

  const idList = ids.join(",");
  const [rows] = await pool.query<ProductImageRow[]>(
    `
    SELECT product_id, image_url, display_order
    FROM product_images
    WHERE product_id IN (${idList})
      AND (is_active = 1 OR is_active IS NULL)
    ORDER BY product_id ASC, display_order ASC, id ASC
    `,
  );

  for (const row of rows ?? []) {
    const pid = Number(row.product_id);
    const url = resolveProductImagePublicUrl(row.image_url);
    if (!url) continue;
    const list = map.get(pid) ?? [];
    list.push(url);
    map.set(pid, list);
  }

  return map;
}

/** Legacy JSON column on `products` / `tbl_product`, then v2 `product_images` rows. */
export function resolveProductImagesForList(
  productId: number,
  product: Record<string, unknown>,
  imagesMap: Map<number, string[]>,
): string[] {
  const fromTable = imagesMap.get(Number(productId));
  if (fromTable?.length) return fromTable;

  const legacyRaw = product.product_images;
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(String(legacyRaw)) as unknown;
      if (Array.isArray(parsed)) {
        const urls = parsed.map((item) => resolveProductImagePublicUrl(item)).filter(Boolean);
        if (urls.length) return urls;
      }
    } catch {
      /* ignore invalid JSON */
    }
  }

  return [];
}

/**
 * Variants + pricing + inventory — columns aligned with hellochotu_microservices.
 * Aliases keep legacy PHP response field names unchanged.
 */
export async function fetchVariantsByProductId(productId: number): Promise<VariantRow[]> {
  const [variants] = await pool.query<VariantRow[]>(
    `
    SELECT
      v.id,
      v.product_id,
      v.variant_name AS title,
      '' AS subscription_required,
      v.variant_image_url AS attr_image,
      v.status,
      COALESCE(inv.is_out_of_stock, 0) AS out_of_stock,
      COALESCE(pr.mrp, 0) AS normal_price,
      0 AS subscribe_price,
      COALESCE(pr.discount_amount, 0) AS discount,
      COALESCE(pr.selling_price, pr.mrp, 0) AS discounted_price
    FROM product_variants v
    LEFT JOIN product_inventory inv ON inv.variant_id = v.id
    LEFT JOIN product_pricing pr ON pr.variant_id = v.id AND (pr.is_active = 1 OR pr.is_active IS NULL)
    WHERE v.product_id = :product_id
      AND (v.is_deleted = 0 OR v.is_deleted IS NULL)
      AND (v.deleted_at IS NULL)
    ORDER BY v.id ASC
    `,
    { product_id: productId },
  );
  return variants ?? [];
}

/** Legacy PHP-shaped attribute object — same keys as tbl_product_attribute API */
export function mapVariantToLegacyAttribute(v: VariantRow, opts?: { includeId?: boolean }) {
  const normal = Number(v.normal_price ?? 0);
  const disc = Number(v.discount ?? 0);
  let discounted = Number(v.discounted_price ?? 0);
  if (!discounted || discounted <= 0) {
    discounted = normal - disc;
    if (discounted <= 0 && normal > 0) discounted = 1;
  }
  const outOfStock = v.out_of_stock !== undefined ? Number(v.out_of_stock) : 1;

  const base: Record<string, unknown> = {
    attribute_id: String(v.id),
    product_id: String(v.product_id),
    normal_price: fmt0(normal),
    subscribe_price: fmt0(Number(v.subscribe_price ?? 0)),
    title: String(v.title ?? "").trim(),
    product_discount_amt: fmt0(disc),
    product_discount: fmt0(disc),
    discounted_price: fmt0(discounted),
    Product_Out_Stock: String(outOfStock),
    subscription_required: String(v.subscription_required ?? ""),
    attr_image: v.attr_image ?? "",
    status: String(v.status ?? "1"),
  };

  if (opts?.includeId) {
    base.id = v.id;
    const is_stock = outOfStock === 0 ? 1 : 0;
    let discount_percentage = 0;
    if (normal > 0) {
      discount_percentage = Math.round(((normal - discounted) / normal) * 100);
    }
    base.discount = fmt0(disc);
    base.discount_percentage = String(discount_percentage);
    base.discount_amount = fmt0(disc);
    base.is_stock = is_stock;
  }

  return base;
}

export type ProductV2CoreInsert = {
  title: string;
  img: string;
  description: string;
  status: number;
  is_loose_product?: number;
  approval_status?: string;
};

export type ProductV2Extras = {
  cat_id?: string | null;
  sub_cat_id?: string | null;
  about_product?: string | null;
  product_information?: string | null;
  fssai_lic?: string | null;
  product_images?: string | null;
  galleryPaths?: string[];
  /** On update: replace `product_images` rows when gallery paths are present. */
  replaceGalleryImages?: boolean;
};

/** `product_category_mappings.category_id` stores subcategory id (legacy `sub_cat_id`). */
export function resolveSubcategoryIdForMapping(
  cat_id?: string | null,
  sub_cat_id?: string | null,
): number | null {
  const sub = sub_cat_id != null ? Number(String(sub_cat_id).trim()) : NaN;
  if (Number.isFinite(sub) && sub > 0) return sub;
  const cat = cat_id != null ? Number(String(cat_id).trim()) : NaN;
  if (Number.isFinite(cat) && cat > 0) return cat;
  return null;
}

function parseGalleryPaths(product_imagesJson: string | null | undefined, galleryPaths?: string[]): string[] {
  const out: string[] = [];
  if (galleryPaths?.length) {
    for (const p of galleryPaths) {
      const s = String(p ?? "").trim();
      if (s) out.push(s);
    }
  }
  if (product_imagesJson) {
    try {
      const parsed = JSON.parse(product_imagesJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const s = String(item ?? "").trim();
          if (s) out.push(s);
        }
      }
    } catch {
      /* ignore invalid JSON */
    }
  }
  return [...new Set(out)];
}

/** Metadata, category mapping, gallery rows — normalized schema side tables. */
export async function saveProductV2Extras(productId: number, extras: ProductV2Extras): Promise<void> {
  const subCatId = resolveSubcategoryIdForMapping(extras.cat_id, extras.sub_cat_id);
  if (subCatId) {
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM product_category_mappings WHERE product_id = :product_id LIMIT 1`,
      { product_id: productId },
    );
    if (existing?.length) {
      await pool.query(
        `
        UPDATE product_category_mappings
        SET category_id = :category_id, is_primary = 1, status = 1
        WHERE id = :id
        `,
        { category_id: subCatId, id: (existing[0] as RowDataPacket).id },
      );
    } else {
      await pool.query(
        `
        INSERT INTO product_category_mappings (product_id, category_id, is_primary, status)
        VALUES (:product_id, :category_id, 1, 1)
        `,
        { product_id: productId, category_id: subCatId },
      );
    }
  }

  await pool.query(
    `
    INSERT INTO product_metadata (product_id, about_product, product_information, fssai_license_number)
    VALUES (:product_id, :about_product, :product_information, :fssai_license_number)
    ON DUPLICATE KEY UPDATE
      about_product = VALUES(about_product),
      product_information = VALUES(product_information),
      fssai_license_number = VALUES(fssai_license_number)
    `,
    {
      product_id: productId,
      about_product: extras.about_product ?? null,
      product_information: extras.product_information ?? null,
      fssai_license_number: extras.fssai_lic ?? null,
    },
  );

  const paths = parseGalleryPaths(extras.product_images, extras.galleryPaths);
  if (extras.replaceGalleryImages && paths.length > 0) {
    await pool.query(`DELETE FROM product_images WHERE product_id = :product_id`, { product_id: productId });
  }
  for (let i = 0; i < paths.length; i++) {
    await pool.query(
      `
      INSERT INTO product_images (product_id, image_url, display_order, is_active)
      VALUES (:product_id, :image_url, :display_order, 1)
      `,
      { product_id: productId, image_url: paths[i], display_order: i },
    );
  }
}

export async function insertProductV2(
  storeIdNum: number,
  core: ProductV2CoreInsert,
  extras: ProductV2Extras,
): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `
    INSERT INTO products (
      store_id, name, primary_image_url, description, status,
      is_loose_product, approval_status, is_deleted
    )
    VALUES (
      :store_id, :title, :img, :description, :status,
      :is_loose_product, :approval_status, 0
    )
    `,
    {
      store_id: storeIdNum,
      title: core.title,
      img: core.img,
      description: core.description,
      status: core.status,
      is_loose_product: core.is_loose_product ?? 0,
      approval_status: core.approval_status ?? "approved",
    } as any,
  );
  const productId = Number(result.insertId);
  await saveProductV2Extras(productId, extras);
  return productId;
}

export async function updateProductV2Row(
  productId: number,
  storeIdNum: number,
  core: ProductV2CoreInsert,
  extras: ProductV2Extras,
): Promise<void> {
  await pool.query(
    `
    UPDATE products
    SET
      primary_image_url = :img,
      status = :status,
      description = :description,
      name = :title
    WHERE id = :product_id AND store_id = :store_id
    `,
    {
      product_id: productId,
      store_id: storeIdNum,
      title: core.title,
      img: core.img,
      description: core.description,
      status: core.status,
    } as any,
  );
  await saveProductV2Extras(productId, extras);
}

export async function insertVariantInventoryV2(
  productId: number,
  variantId: number,
  opts: { available_quantity?: number; is_out_of_stock: number },
): Promise<void> {
  const qty = opts.available_quantity ?? (opts.is_out_of_stock ? 0 : 1);
  await pool.query(
    `
    INSERT INTO product_inventory (product_id, variant_id, available_quantity, is_out_of_stock)
    VALUES (:product_id, :variant_id, :available_quantity, :is_out_of_stock)
    `,
    {
      product_id: productId,
      variant_id: variantId,
      available_quantity: qty,
      is_out_of_stock: opts.is_out_of_stock,
    } as any,
  );
}

export function resolveVariantStockFromAttr(attr: Record<string, unknown>): {
  available_quantity: number;
  is_out_of_stock: number;
} {
  const mstockRaw = String(attr?.mstock ?? "1").trim();
  const mstockNum = Number(mstockRaw);
  const is_out_of_stock = mstockRaw === "0" ? 1 : 0;
  const available_quantity =
    Number.isFinite(mstockNum) && mstockNum > 0 ? Math.floor(mstockNum) : is_out_of_stock ? 0 : 1;
  return { available_quantity, is_out_of_stock };
}
