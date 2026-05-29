import { pool } from "../db/mysql";
import { useProductSchemaV2, useStoresTable } from "../config/schema";
import { type RowDataPacket } from "mysql2/promise";

function asUtf8mb4Bin(expr: string) {
  return `CAST(${expr} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_bin`;
}

function rmIdEqualsSql(column: string, param = ":rm_id") {
  return `${asUtf8mb4Bin(`TRIM(${column})`)} = ${asUtf8mb4Bin(`TRIM(${param})`)}`;
}

function storesRmWhereSql() {
  return `(${rmIdEqualsSql("s.regional_manager_id")} OR ${rmIdEqualsSql("s.store_code")})`;
}

const STORE_ADDRESS_SQL = `TRIM(BOTH ',' FROM CONCAT_WS(', ',
  CAST(IFNULL(sa.address_line_1, '') AS CHAR CHARACTER SET utf8mb4),
  CAST(IFNULL(sa.city, '') AS CHAR CHARACTER SET utf8mb4),
  CAST(IFNULL(sa.postal_code, '') AS CHAR CHARACTER SET utf8mb4)
))`;

export type StoresSearchInput = {
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

type CountRow = RowDataPacket & { total: number };

type SearchStoreRow = RowDataPacket & {
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
  product_count: number;
  pending_count: number;
  approved_count: number;
  loose_product_count: number;
  non_onboarded_store_id: string | null;
  non_onboarded_created_at: string | null;
  created_at: string | null;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toPage(v: unknown) {
  const n = Number(s(v));
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}

function toLimit(v: unknown) {
  const n = Number(s(v));
  if (!Number.isFinite(n)) return 10;
  return Math.min(50, Math.max(1, Math.trunc(n)));
}

function mapSearchStore(row: SearchStoreRow) {
  const nosId = row.non_onboarded_store_id ? s(row.non_onboarded_store_id) : null;
  return {
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
    store_type: nosId ? "non_onboard_store" : "onboard_store",
    non_onboarded_store_id: nosId,
    non_onboarded_date: row.non_onboarded_created_at ?? null,
    trnaseferdate: row.created_at ?? null,
  };
}

function colEqualsSql(left: string, right: string) {
  return `${asUtf8mb4Bin(`TRIM(CAST(${left} AS CHAR))`)} = ${asUtf8mb4Bin(`TRIM(CAST(${right} AS CHAR))`)}`;
}

function legacyNonOnboardSql() {
  const sdNosRef = asUtf8mb4Bin("TRIM(CAST(IFNULL(sd.non_onboarded_store_id,'') AS CHAR))");
  const nStoreId = asUtf8mb4Bin("TRIM(CAST(IFNULL(n.store_id,'') AS CHAR))");
  const nonOnboardWhere = `
    ${sdNosRef} <> ${asUtf8mb4Bin("''")}
    AND ${colEqualsSql("n.rm_id", "sd.rm_id")}
    AND ${nStoreId} = ${sdNosRef}
  `;
  return {
    non_onboarded_store_id: `(SELECT COALESCE(NULLIF(TRIM(CAST(n.store_id AS CHAR)), ''), CONCAT('SRID', n.id)) FROM non_onboarded_store n WHERE ${nonOnboardWhere} ORDER BY n.id DESC LIMIT 1)`,
    non_onboarded_created_at: `COALESCE(sd.non_onboarded_date, (SELECT n.created_at FROM non_onboarded_store n WHERE ${nonOnboardWhere} ORDER BY n.id DESC LIMIT 1))`,
  };
}

function v2NonOnboardSql() {
  const sdNosRef = asUtf8mb4Bin("TRIM(CAST(IFNULL(s.store_code,'') AS CHAR))");
  const nStoreId = asUtf8mb4Bin("TRIM(CAST(IFNULL(n.store_id,'') AS CHAR))");
  const nonOnboardWhere = `
    ${sdNosRef} <> ${asUtf8mb4Bin("''")}
    AND ${colEqualsSql("n.rm_id", "s.regional_manager_id")}
    AND ${nStoreId} = ${sdNosRef}
  `;
  return {
    non_onboarded_store_id: `(SELECT COALESCE(NULLIF(TRIM(CAST(n.store_id AS CHAR)), ''), CONCAT('SRID', n.id)) FROM non_onboarded_store n WHERE ${nonOnboardWhere} ORDER BY n.id DESC LIMIT 1)`,
    non_onboarded_created_at: `(SELECT n.created_at FROM non_onboarded_store n WHERE ${nonOnboardWhere} ORDER BY n.id DESC LIMIT 1)`,
  };
}

function legacyProductJoinSql() {
  return `
    LEFT JOIN (
      SELECT
        store_id,
        COUNT(*) AS product_count,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(approval_status, ''))) = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(approval_status, ''))) = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN loose_product = 1 THEN 1 ELSE 0 END) AS loose_product_count
      FROM tbl_product
      GROUP BY store_id
    ) p ON p.store_id = sd.id
  `;
}

function v2ProductJoinSql() {
  const approval = asUtf8mb4Bin("LOWER(TRIM(COALESCE(approval_status, 'pending')))");
  return `
    LEFT JOIN (
      SELECT
        store_id,
        COUNT(*) AS product_count,
        SUM(CASE WHEN ${approval} = ${asUtf8mb4Bin("'pending'")} THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN ${approval} = ${asUtf8mb4Bin("'approved'")} THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN is_loose_product = 1 THEN 1 ELSE 0 END) AS loose_product_count
      FROM products
      WHERE (is_deleted = 0 OR is_deleted IS NULL)
      GROUP BY store_id
    ) p ON p.store_id = s.id
  `;
}

async function storesSearchFromStoresTable(input: StoresSearchInput): Promise<ServiceResult> {
  const rm_id = s(input.rm_id);
  const page = toPage(input.page);
  const limit = toLimit(input.limit);
  const offset = (page - 1) * limit;

  const whereParts: string[] = [storesRmWhereSql(), `(s.is_deleted = 0 OR s.is_deleted IS NULL)`];
  const params: Record<string, unknown> = { rm_id };

  const keyword = s(input.keyword);
  if (keyword) {
    whereParts.push(
      `(${asUtf8mb4Bin("s.name")} LIKE ${asUtf8mb4Bin(":kw")} OR ${asUtf8mb4Bin("sc.phone_number")} LIKE ${asUtf8mb4Bin(":kw")} OR ${asUtf8mb4Bin("sc.email")} LIKE ${asUtf8mb4Bin(":kw")})`,
    );
    params.kw = `%${keyword}%`;
  }

  if (input.status !== undefined && input.status !== null && s(input.status) !== "") {
    whereParts.push("s.status = :status");
    params.status = s(input.status);
  }

  const whereClause = whereParts.join(" AND ");
  const nos = v2NonOnboardSql();
  const countFrom = keyword
    ? "stores s LEFT JOIN store_credentials sc ON sc.store_id = s.id"
    : "stores s";

  try {
    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(DISTINCT s.id) AS total FROM ${countFrom} WHERE ${whereClause}`,
      params as any,
    );
    const totalRecords = Number(countRows?.[0]?.total ?? 0);
    const totalPages = limit > 0 ? Math.ceil(totalRecords / limit) : 0;

    const [rows] = await pool.query<SearchStoreRow[]>(
      `
      SELECT
        s.id,
        s.name AS business_name,
        sc.email,
        sc.phone_number AS mobile,
        ${STORE_ADDRESS_SQL} AS full_address,
        sa.postal_code AS pincode,
        s.location_code AS business_type,
        s.category_ids,
        soh.opening_time AS opentime,
        soh.closing_time AS closetime,
        sa.landmark,
        CAST(sa.latitude AS CHAR) AS latitude,
        CAST(sa.longitude AS CHAR) AS longitude,
        s.zone_id,
        spm.bank_name,
        spm.ifsc_code AS ifsc,
        spm.account_holder_name,
        spm.account_number,
        spm.upi_id AS transaction_id,
        s.status,
        s.status AS rstatus,
        s.rating AS rate,
        NULL AS commission,
        s.logo_url AS store_banner,
        s.banner_url AS cover_image_url,
        s.regional_manager_id AS rm_id,
        s.regional_aggregator_id AS ra_id,
        s.franchisee_id AS fr_id,
        s.tagline AS slogan,
        NULL AS slogan_title,
        s.short_description AS tags,
        s.description,
        s.cancellation_policy AS cancle_policy,
        NULL AS remark,
        s.owner_name,
        soh.break_start_time,
        soh.break_end_time,
        NULL AS aadhar_back,
        s.referral_code AS refercode,
        COALESCE(p.product_count, 0) AS product_count,
        COALESCE(p.pending_count, 0) AS pending_count,
        COALESCE(p.approved_count, 0) AS approved_count,
        COALESCE(p.loose_product_count, 0) AS loose_product_count,
        ${nos.non_onboarded_store_id} AS non_onboarded_store_id,
        ${nos.non_onboarded_created_at} AS non_onboarded_created_at,
        s.created_at AS created_at
      FROM stores s
      LEFT JOIN store_credentials sc ON sc.store_id = s.id
      LEFT JOIN store_addresses sa ON sa.store_id = s.id AND sa.is_default = 1
        AND (sa.is_deleted = 0 OR sa.is_deleted IS NULL)
      LEFT JOIN store_operating_hours soh ON soh.store_id = s.id
      LEFT JOIN store_payment_methods spm ON spm.store_id = s.id AND spm.is_primary = 1
        AND (spm.is_deleted = 0 OR spm.is_deleted IS NULL)
      ${v2ProductJoinSql()}
      WHERE ${whereClause}
      ORDER BY s.id DESC
      LIMIT :limit OFFSET :offset
      `,
      { ...params, limit, offset } as any,
    );

    const stores = (rows ?? []).map(mapSearchStore);
    return {
      httpStatus: 200,
      body: {
        success: true,
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: stores.length > 0 ? "Stores retrieved successfully" : "No stores found",
        pagination: { total_records: totalRecords, total_pages: totalPages, current_page: page, limit },
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

async function storesSearchLegacy(input: StoresSearchInput): Promise<ServiceResult> {
  const rm_id = s(input.rm_id);
  const page = toPage(input.page);
  const limit = toLimit(input.limit);
  const offset = (page - 1) * limit;

  const whereParts: string[] = [rmIdEqualsSql("sd.rm_id")];
  const params: Record<string, unknown> = { rm_id };

  const keyword = s(input.keyword);
  if (keyword) {
    whereParts.push("(sd.title LIKE :kw OR sd.mobile LIKE :kw OR sd.email LIKE :kw)");
    params.kw = `%${keyword}%`;
  }

  if (input.status !== undefined && input.status !== null && s(input.status) !== "") {
    whereParts.push("sd.status = :status");
    params.status = s(input.status);
  }

  const whereClause = whereParts.join(" AND ");
  const nos = legacyNonOnboardSql();
  const productJoin = useProductSchemaV2()
    ? `
    LEFT JOIN (
      SELECT
        store_id,
        COUNT(*) AS product_count,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(approval_status, ''))) = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(approval_status, ''))) = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN is_loose_product = 1 THEN 1 ELSE 0 END) AS loose_product_count
      FROM products
      WHERE (is_deleted = 0 OR is_deleted IS NULL)
      GROUP BY store_id
    ) p ON p.store_id = sd.id
    `
    : legacyProductJoinSql();

  try {
    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM service_details sd WHERE ${whereClause}`,
      params as any,
    );
    const totalRecords = Number(countRows?.[0]?.total ?? 0);
    const totalPages = limit > 0 ? Math.ceil(totalRecords / limit) : 0;

    const [rows] = await pool.query<SearchStoreRow[]>(
      `
      SELECT
        sd.id,
        sd.title AS business_name,
        sd.email,
        sd.mobile,
        sd.full_address,
        sd.pincode,
        sd.lcode AS business_type,
        sd.catid AS category_ids,
        sd.opentime,
        sd.closetime,
        sd.landmark,
        sd.lats AS latitude,
        sd.longs AS longitude,
        sd.zone_id,
        sd.bank_name,
        sd.ifsc,
        sd.receipt_name AS account_holder_name,
        sd.acc_number AS account_number,
        sd.upi_id AS transaction_id,
        sd.status,
        sd.rstatus,
        sd.rate,
        sd.commission,
        sd.rimg AS store_banner,
        sd.cover_img AS cover_image_url,
        sd.rm_id,
        sd.ra_id,
        sd.fr_id,
        sd.slogan,
        sd.slogan_title,
        sd.sdesc AS tags,
        sd.cdesc AS description,
        sd.cancle_policy,
        sd.remark,
        sd.owner_name,
        sd.break_start_time,
        sd.break_end_time,
        sd.aadhar_back,
        sd.refercode,
        COALESCE(p.product_count, 0) AS product_count,
        COALESCE(p.pending_count, 0) AS pending_count,
        COALESCE(p.approved_count, 0) AS approved_count,
        COALESCE(p.loose_product_count, 0) AS loose_product_count,
        ${nos.non_onboarded_store_id} AS non_onboarded_store_id,
        ${nos.non_onboarded_created_at} AS non_onboarded_created_at,
        sd.created_at AS created_at
      FROM service_details sd
      ${productJoin}
      WHERE ${whereClause}
      ORDER BY sd.id DESC
      LIMIT :limit OFFSET :offset
      `,
      { ...params, limit, offset } as any,
    );

    const stores = (rows ?? []).map(mapSearchStore);
    return {
      httpStatus: 200,
      body: {
        success: true,
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: stores.length > 0 ? "Stores retrieved successfully" : "No stores found",
        pagination: { total_records: totalRecords, total_pages: totalPages, current_page: page, limit },
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

export async function storesSearchService(input: StoresSearchInput): Promise<ServiceResult> {
  const rm_id = s(input.rm_id);
  if (!rm_id) {
    return {
      httpStatus: 400,
      body: {
        success: false,
        ResponseCode: "401",
        Result: "false",
        ResponseMsg: "RM ID is required",
      },
    };
  }

  if (useStoresTable()) {
    return storesSearchFromStoresTable(input);
  }

  return storesSearchLegacy(input);
}
