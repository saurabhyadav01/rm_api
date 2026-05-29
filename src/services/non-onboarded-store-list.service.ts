import { pool } from "../db/mysql";
import { type RowDataPacket } from "mysql2/promise";

function asUtf8mb4Bin(expr: string) {
  return `CAST(${expr} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_bin`;
}

function rmIdEqualsSql(column: string, param = ":rm_id") {
  return `${asUtf8mb4Bin(`TRIM(${column})`)} = ${asUtf8mb4Bin(`TRIM(${param})`)}`;
}

type Input = {
  rm_id: string;
  keyword?: unknown;
  page?: unknown;
  limit?: unknown;
};

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

function toInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

type CountRow = RowDataPacket & { total: number };

type StoreRow = RowDataPacket & {
  store_id: string | null;
  shop_name: string;
  owner_name: string;
  phone_no: string;
  category: string;
  latitude: string;
  longitude: string;
  current_location: string;
  address_line: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  email: string | null;
  shop_banner: string | null;
  is_active: number;
  created_at: string;
};

export async function listNonOnboardedStoresService(input: Input): Promise<ServiceResult> {
  const rm_id = String(input.rm_id ?? "").trim();
  const keyword = String(input.keyword ?? "").trim();
  const page = toInt(input.page, 1);
  const limit = toInt(input.limit, 10);
  const offset = (page - 1) * limit;

  try {
    const whereParts: string[] = [rmIdEqualsSql("ns.rm_id"), "ns.is_deleted = 0"];
    const params: Record<string, unknown> = { rm_id };

    if (keyword) {
      whereParts.push(
        `(${asUtf8mb4Bin("ns.shop_name")} LIKE ${asUtf8mb4Bin(":kw")} OR ${asUtf8mb4Bin("ns.phone_no")} LIKE ${asUtf8mb4Bin(":kw")} OR ${asUtf8mb4Bin("ns.email")} LIKE ${asUtf8mb4Bin(":kw")})`,
      );
      params.kw = `%${keyword}%`;
    }

    const whereClause = whereParts.join(" AND ");

    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) as total FROM non_onboarded_store ns WHERE ${whereClause}`,
      params as any,
    );
    const totalRecords = Number(countRows?.[0]?.total ?? 0);
    const totalPages = Math.ceil(totalRecords / limit);

    const [rows] = await pool.query<StoreRow[]>(
      `
      SELECT
        store_id,
        shop_name,
        owner_name,
        phone_no,
        category,
        latitude,
        longitude,
        current_location,
        address_line,
        city,
        district,
        state,
        pincode,
        email,
        shop_banner,
        is_active,
        created_at
      FROM non_onboarded_store ns
      WHERE ${whereClause}
      ORDER BY ns.id DESC
      LIMIT :limit OFFSET :offset
      `,
      ({ ...params, limit, offset } as any),
    );

    const data = rows ?? [];

    return {
      httpStatus: 200,
      body: {
        success: true,
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: data.length > 0 ? "Non-onboarded stores retrieved successfully" : "No non-onboarded stores found",
        pagination: {
          total_records: totalRecords,
          total_pages: totalPages,
          current_page: page,
          limit,
        },
        data,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      httpStatus: 500,
      body: {
        success: false,
        ResponseCode: "500",
        Result: "false",
        ResponseMsg: `Database error: ${msg}`,
      },
    };
  }
}

