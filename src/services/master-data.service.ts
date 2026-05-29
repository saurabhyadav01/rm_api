import { pool } from "../db/mysql";
import { MASTER_DATA_STATIC } from "../config/master-data.static";
import { useProductSchemaV2 } from "../config/schema";
import { type RowDataPacket } from "mysql2/promise";

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type TitleRow = RowDataPacket & { title: string };
type PlanRow = RowDataPacket & {
  id: number;
  plan_title: string | null;
  description: string | null;
};
type StoreMasterRow = RowDataPacket & {
  id: number;
  category_title: string | null;
  slogan_title: string | null;
  slogan_subtitle: string | null;
  tag: string | null;
  short_description: string | null;
  cancel_policy: string | null;
  commission: string | number | null;
  created_at: string | null;
};

function mapStoreMaster(row: StoreMasterRow) {
  return {
    id: row.id,
    category_title: row.category_title ?? "",
    slogan_title: row.slogan_title ?? "",
    slogan_subtitle: row.slogan_subtitle ?? "",
    tag: row.tag ?? "",
    short_description: row.short_description ?? "",
    cancel_policy: row.cancel_policy ?? "",
    commission: row.commission !== null && row.commission !== undefined ? String(row.commission) : "0",
    created_at: row.created_at ?? "",
  };
}

async function fetchCategoryTitles(): Promise<string[]> {
  if (useProductSchemaV2()) {
    const [rows] = await pool.query<TitleRow[]>(
      `
      SELECT name AS title
      FROM categories
      WHERE status = 1
        AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY id ASC
      `,
    );
    return (rows ?? []).map((r) => r.title ?? "").filter(Boolean);
  }

  const [rows] = await pool.query<TitleRow[]>(
    `SELECT title FROM tbl_category WHERE status = 1 ORDER BY id ASC`,
  );
  return (rows ?? []).map((r) => r.title ?? "").filter(Boolean);
}

async function fetchPlans(): Promise<{ id: number; title: string; description: string }[]> {
  if (useProductSchemaV2()) {
    const [rows] = await pool.query<PlanRow[]>(
      `
      SELECT id, plan_title, description
      FROM subscription_store_plan
      WHERE status = 1
      ORDER BY id ASC
      `,
    );
    return (rows ?? []).map((r) => ({
      id: r.id,
      title: r.plan_title ?? "",
      description: r.description ?? "",
    }));
  }

  const [rows] = await pool.query<PlanRow[]>(
    `
    SELECT id, plan_title, description
    FROM tbl_joining_plan
    WHERE status = 1
    ORDER BY id ASC
    `,
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    title: r.plan_title ?? "",
    description: r.description ?? "",
  }));
}

async function fetchStoreMasters(): Promise<ReturnType<typeof mapStoreMaster>[]> {
  try {
    const [rows] = await pool.query<StoreMasterRow[]>(
      `
      SELECT
        id,
        category_title,
        slogan_title,
        slogan_subtitle,
        tag,
        short_description,
        cancel_policy,
        commission,
        created_at
      FROM tbl_store_master
      ORDER BY id ASC
      `,
    );
    return (rows ?? []).map(mapStoreMaster);
  } catch {
    return [];
  }
}

export async function masterDataService(): Promise<ServiceResult> {
  try {
    const categories = await fetchCategoryTitles();
    const plans = await fetchPlans();
    const storeMasters = await fetchStoreMasters();

    return {
      httpStatus: 200,
      body: {
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: "Master data retrieved successfully!",
        MasterData: {
          categories_master: {
            total: categories.length,
            data: categories,
          },
          store_slogan_master: {
            total: storeMasters.length,
            data: storeMasters,
          },
          upiid: [...MASTER_DATA_STATIC.upiid],
          account_detail: { ...MASTER_DATA_STATIC.account_detail },
          assistance: { ...MASTER_DATA_STATIC.assistance },
          rm_list: [...MASTER_DATA_STATIC.rm_list],
          location: [...MASTER_DATA_STATIC.location],
          upi_img: { ...MASTER_DATA_STATIC.upi_img },
          plans,
        },
      },
    };
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
