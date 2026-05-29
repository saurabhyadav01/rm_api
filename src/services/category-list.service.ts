import { pool } from "../db/mysql";
import { useProductSchemaV2 } from "../config/schema";
import { type RowDataPacket } from "mysql2/promise";

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type CategoryRow = RowDataPacket & {
  id: number;
  title: string | null;
  img: string | null;
  status: string | number | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapCategory(row: CategoryRow) {
  return {
    id: row.id,
    title: row.title ?? "",
    img: row.img ?? "",
    status: row.status,
    description: row.description ?? "",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

async function categoryListLegacy(): Promise<ServiceResult> {
  const [rows] = await pool.query<CategoryRow[]>(
    `
    SELECT DISTINCT
      c.id,
      c.title,
      c.img,
      c.status,
      c.description,
      c.created_at,
      c.updated_at
    FROM tbl_category c
    INNER JOIN tbl_product_category pc ON c.id = pc.category_type_id
    WHERE c.status = '1'
    ORDER BY c.id ASC
    `,
  );

  const categorydata = (rows ?? []).map(mapCategory);
  return {
    httpStatus: 200,
    body: {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Categories Retrieved Successfully",
      total: categorydata.length,
      categorydata,
    },
  };
}

async function categoryListV2(): Promise<ServiceResult> {
  const [rows] = await pool.query<CategoryRow[]>(
    `
    SELECT DISTINCT
      c.id,
      c.name AS title,
      COALESCE(ci.image_url, '') AS img,
      c.status,
      c.description,
      c.created_at,
      c.updated_at
    FROM categories c
    INNER JOIN subcategories sc ON sc.category_id = c.id
      AND (sc.is_deleted = 0 OR sc.is_deleted IS NULL)
    INNER JOIN product_category_mappings pcm ON pcm.category_id = sc.id
      AND (pcm.status = 1 OR pcm.status IS NULL)
    INNER JOIN products p ON p.id = pcm.product_id
      AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
    LEFT JOIN category_images ci ON ci.category_id = c.id
      AND ci.image_type = 'thumbnail'
      AND ci.is_active = 1
    WHERE c.status = 1
      AND (c.is_deleted = 0 OR c.is_deleted IS NULL)
    ORDER BY c.id ASC
    `,
  );

  const categorydata = (rows ?? []).map(mapCategory);
  return {
    httpStatus: 200,
    body: {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Categories Retrieved Successfully",
      total: categorydata.length,
      categorydata,
    },
  };
}

export async function categoryListService(): Promise<ServiceResult> {
  try {
    if (useProductSchemaV2()) {
      return await categoryListV2();
    }
    return await categoryListLegacy();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      httpStatus: 500,
      body: {
        ResponseCode: "500",
        Result: "false",
        ResponseMsg: `Database error: ${msg}`,
      },
    };
  }
}
