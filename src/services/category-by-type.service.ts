import { pool } from "../db/mysql";
import { useProductSchemaV2 } from "../config/schema";
import { type RowDataPacket } from "mysql2/promise";

export type CategoryByTypeInput = {
  category_type_id: string;
};

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type CategoryRow = RowDataPacket & {
  id: number;
  category_type_id: number | string;
  name: string | null;
  img: string | null;
  status: string | number | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapCategory(row: CategoryRow, categoryTypeId: string) {
  return {
    id: row.id,
    category_type_id: row.category_type_id ?? categoryTypeId,
    title: row.name ?? "",
    img: row.img ?? "",
    status: row.status,
    description: row.description ?? "",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

function notFoundBody(categoryTypeId: string): ServiceResult {
  return {
    httpStatus: 404,
    body: {
      ResponseCode: "404",
      Result: "false",
      ResponseMsg: "Category not found for the given category_type_id",
      category_type_id: categoryTypeId,
      total: 0,
      categorydata: [],
    },
  };
}

function successBody(categoryTypeId: string, categorydata: ReturnType<typeof mapCategory>[]): ServiceResult {
  return {
    httpStatus: 200,
    body: {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Product Categories Retrieved Successfully",
      category_type_id: categoryTypeId,
      total: categorydata.length,
      categorydata,
    },
  };
}

async function categoryByTypeLegacy(categoryTypeId: string): Promise<ServiceResult> {
  const [rows] = await pool.query<CategoryRow[]>(
    `
    SELECT
      id,
      category_type_id,
      name,
      img,
      status,
      description,
      created_at,
      updated_at
    FROM tbl_product_category
    WHERE category_type_id = :category_type_id
      AND status = '1'
    ORDER BY id ASC
    `,
    { category_type_id: categoryTypeId } as any,
  );

  const list = rows ?? [];
  if (!list.length) return notFoundBody(categoryTypeId);
  return successBody(
    categoryTypeId,
    list.map((r) => mapCategory(r, categoryTypeId)),
  );
}

async function categoryByTypeV2(categoryTypeId: string): Promise<ServiceResult> {
  const [rows] = await pool.query<CategoryRow[]>(
    `
    SELECT
      sc.id,
      sc.category_id AS category_type_id,
      sc.name,
      COALESCE(si.image_url, '') AS img,
      sc.status,
      sc.description,
      sc.created_at,
      sc.updated_at
    FROM subcategories sc
    LEFT JOIN subcategory_images si ON si.subcategory_id = sc.id
      AND si.image_type = 'thumbnail'
      AND si.is_active = 1
    WHERE sc.category_id = :category_type_id
      AND sc.status = 1
      AND (sc.is_deleted = 0 OR sc.is_deleted IS NULL)
    ORDER BY sc.id ASC
    `,
    { category_type_id: Number(categoryTypeId) || categoryTypeId } as any,
  );

  const list = rows ?? [];
  if (!list.length) return notFoundBody(categoryTypeId);
  return successBody(
    categoryTypeId,
    list.map((r) => mapCategory(r, categoryTypeId)),
  );
}

export async function categoryByTypeService(input: CategoryByTypeInput): Promise<ServiceResult> {
  const categoryTypeId = String(input.category_type_id ?? "").trim();
  if (!categoryTypeId) {
    return {
      httpStatus: 400,
      body: {
        ResponseCode: "401",
        Result: "false",
        ResponseMsg: "category_type_id is required",
      },
    };
  }

  try {
    if (useProductSchemaV2()) {
      return await categoryByTypeV2(categoryTypeId);
    }
    return await categoryByTypeLegacy(categoryTypeId);
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
