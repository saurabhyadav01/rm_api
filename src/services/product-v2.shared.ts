import { pool } from "../db/mysql";
import { type RowDataPacket } from "mysql2/promise";

export const PRODUCT_NOT_DELETED = `(p.is_deleted = 0 OR p.is_deleted IS NULL)`;
export const PRODUCT_ACTIVE = `${PRODUCT_NOT_DELETED} AND (p.status = 1 OR p.status = '1')`;

/** DB column for product title (microservices: `name`, legacy: `title`). */
export const PRODUCT_TITLE_SQL = "COALESCE(p.name, p.title)";

type VariantRow = RowDataPacket & Record<string, unknown>;

export function fmt0(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(0);
}

export function productTitleFromRow(product: Record<string, unknown>): string {
  return String(product.name ?? product.title ?? "").trim();
}

export function productImageFromRow(product: Record<string, unknown>): string {
  return String(product.primary_image_url ?? product.img ?? product.image_url ?? "").trim();
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
