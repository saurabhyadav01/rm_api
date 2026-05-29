import { pool } from "../db/mysql";
import { useProductSchemaV2 } from "../config/schema";
import { type RowDataPacket } from "mysql2/promise";

type Input = {
  rm_id: string;
  keyword?: unknown;
  status?: unknown;
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
  id: number;
  business_name: string;
  email: string | null;
  mobile: string;
  full_address: string | null;
  pincode: string | null;
  business_type: string | null;
  category_ids: string | null;
  opentime: string | null;
  closetime: string | null;
  landmark: string | null;
  latitude: string | null;
  longitude: string | null;
  zone_id: string | number | null;
  bank_name: string | null;
  ifsc: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  transaction_id: string | null;
  status: string | null;
  rstatus: string | null;
  rate: string | number | null;
  commission: string | number | null;
  store_banner: string | null;
  cover_image_url: string | null;
  rm_id: string | null;
  ra_id: string | number | null;
  fr_id: string | number | null;
  slogan: string | null;
  slogan_title: string | null;
  tags: string | null;
  description: string | null;
  cancle_policy: string | null;
  remark: string | null;
  owner_name: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  aadhar_back: string | null;
  refercode: string | null;
  non_onboarded_store_id: string | null;
  non_onboarded_created_at: string | null;
  created_at: string | null;
  product_count: number | null;
  pending_count: number | null;
  approved_count: number | null;
  loose_product_count: number | null;
};

export async function storesListService(input: Input): Promise<ServiceResult> {
  const rm_id = String(input.rm_id ?? "").trim();
  const keyword = String(input.keyword ?? "").trim();
  const status = String(input.status ?? "").trim();
  const page = toInt(input.page, 1);
  const limit = toInt(input.limit, 10);
  const offset = (page - 1) * limit;

  try {
    const whereParts: string[] = [
      `(CONVERT(CAST(sd.rm_id AS CHAR) USING utf8mb4) COLLATE utf8mb4_unicode_ci) = (CONVERT(:rm_id USING utf8mb4) COLLATE utf8mb4_unicode_ci)`,
    ];
    const params: Record<string, unknown> = { rm_id };

    if (keyword) {
      whereParts.push("(sd.title LIKE :kw OR sd.mobile LIKE :kw OR sd.email LIKE :kw)");
      params.kw = `%${keyword}%`;
    }

    if (status !== "") {
      whereParts.push("sd.status = :status");
      params.status = status;
    }

    const whereClause = whereParts.join(" AND ");

    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) as total FROM service_details sd WHERE ${whereClause}`,
      params as any,
    );
    const totalRecords = Number(countRows?.[0]?.total ?? 0);
    const totalPages = Math.ceil(totalRecords / limit);

    const sdNosRef = "TRIM(CAST(IFNULL(sd.non_onboarded_store_id,'') AS CHAR))";
    const nStoreId = "TRIM(CAST(IFNULL(n.store_id,'') AS CHAR))";
    const nonOnboardWhere = `
      ${sdNosRef} <> ''
      AND (CONVERT(CAST(n.rm_id AS CHAR) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
          = (CONVERT(CAST(sd.rm_id AS CHAR) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
      AND (CONVERT((${nStoreId}) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
          = (CONVERT((${sdNosRef}) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
    `;

    const productStatsSubquery = useProductSchemaV2()
      ? `
      LEFT JOIN (
        SELECT
          store_id,
          COUNT(*) as product_count,
          SUM(CASE WHEN LOWER(COALESCE(approval_status, '')) = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN LOWER(COALESCE(approval_status, '')) = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN COALESCE(is_loose_product, 0) = 1 THEN 1 ELSE 0 END) as loose_product_count
        FROM products
        WHERE (is_deleted = 0 OR is_deleted IS NULL)
        GROUP BY store_id
      ) p ON p.store_id = sd.id`
      : `
      LEFT JOIN (
        SELECT
          store_id,
          COUNT(*) as product_count,
          SUM(CASE WHEN LOWER(COALESCE(approval_status, '')) = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN LOWER(COALESCE(approval_status, '')) = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN loose_product = 1 THEN 1 ELSE 0 END) as loose_product_count
        FROM tbl_product
        GROUP BY store_id
      ) p ON p.store_id = sd.id`;

    const [rows] = await pool.query<StoreRow[]>(
      `
      SELECT
        sd.id,
        sd.title as business_name,
        sd.email,
        sd.mobile,
        sd.full_address,
        sd.pincode,
        sd.lcode as business_type,
        sd.catid as category_ids,
        sd.opentime,
        sd.closetime,
        sd.landmark,
        sd.lats as latitude,
        sd.longs as longitude,
        sd.zone_id,
        sd.bank_name,
        sd.ifsc,
        sd.receipt_name as account_holder_name,
        sd.acc_number as account_number,
        sd.upi_id as transaction_id,
        sd.status,
        sd.rstatus,
        sd.rate,
        sd.commission,
        sd.rimg as store_banner,
        sd.cover_img as cover_image_url,
        sd.rm_id,
        sd.ra_id,
        sd.fr_id,
        sd.slogan,
        sd.slogan_title,
        sd.sdesc as tags,
        sd.cdesc as description,
        sd.cancle_policy,
        sd.remark,
        sd.owner_name,
        sd.break_start_time,
        sd.break_end_time,
        sd.aadhar_back,
        sd.refercode,
        sd.non_onboarded_date,
        sd.created_at AS created_at,
        (
          SELECT COALESCE(NULLIF(TRIM(CAST(n.store_id AS CHAR)), ''), CONCAT('SRID', n.id))
          FROM non_onboarded_store n
          WHERE ${nonOnboardWhere}
          ORDER BY n.id DESC
          LIMIT 1
        ) AS non_onboarded_store_id,
        COALESCE(
          sd.non_onboarded_date,
          (
            SELECT n.created_at
            FROM non_onboarded_store n
            WHERE ${nonOnboardWhere}
            ORDER BY n.id DESC
            LIMIT 1
          )
        ) AS non_onboarded_created_at,
        COALESCE(p.product_count, 0) as product_count,
        COALESCE(p.pending_count, 0) as pending_count,
        COALESCE(p.approved_count, 0) as approved_count,
        COALESCE(p.loose_product_count, 0) as loose_product_count
      FROM service_details sd
      ${productStatsSubquery}
      WHERE ${whereClause}
      ORDER BY sd.id DESC
      LIMIT :limit OFFSET :offset
      `,
      ({ ...params, limit, offset } as any),
    );

    const stores = (rows ?? []).map((row) => ({
      id: row.id,
      business_name: row.business_name,
      mobile: row.mobile,
      email: row.email,
      full_address: row.full_address,
      pincode: row.pincode,
      status: row.status,
      rstatus: row.rstatus,
      store_banner: row.store_banner,
      rm_id: row.rm_id,
      owner_name: row.owner_name,
      business_type: String(row.business_type ?? "").replaceAll(",", ", "),
      product_count: String(row.product_count ?? 0),
      pending_count: String(row.pending_count ?? 0),
      approved_count: String(row.approved_count ?? 0),
      loose_product_count: String(row.loose_product_count ?? 0),
      category_ids: row.category_ids,
      opentime: row.opentime,
      closetime: row.closetime,
      landmark: row.landmark,
      latitude: row.latitude,
      longitude: row.longitude,
      zone_id: row.zone_id,
      bank_name: row.bank_name,
      ifsc: row.ifsc,
      account_holder_name: row.account_holder_name,
      account_number: row.account_number,
      transaction_id: row.transaction_id,
      rate: row.rate,
      commission: row.commission,
      cover_image_url: row.cover_image_url,
      ra_id: row.ra_id,
      fr_id: row.fr_id,
      slogan: row.slogan,
      slogan_title: row.slogan_title,
      tags: row.tags,
      description: row.description,
      cancle_policy: row.cancle_policy,
      remark: row.remark,
      refercode: row.refercode,
      break_start_time: row.break_start_time ?? null,
      break_end_time: row.break_end_time ?? null,
      aadhar_back: row.aadhar_back ?? null,
      store_type: row.non_onboarded_store_id ? "non_onboard_store" : "onboard_store",
      non_onboarded_store_id: row.non_onboarded_store_id ?? null,
      non_onboarded_date: row.non_onboarded_created_at ?? null,
      trnaseferdate: row.created_at ?? null,
    }));

    return {
      httpStatus: 200,
      body: {
        success: true,
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: stores.length > 0 ? "Stores retrieved successfully" : "No stores found",
        pagination: {
          total_records: totalRecords,
          total_pages: totalPages,
          current_page: page,
          limit,
        },
        stores,
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

