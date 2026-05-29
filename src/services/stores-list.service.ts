import { pool } from "../db/mysql";
import { useProductSchemaV2, useStoresTable } from "../config/schema";
import { type RowDataPacket } from "mysql2/promise";

/** Cast text to utf8mb4_bin so comparisons never mix utf8mb3 / utf8mb4 collations. */
function asUtf8mb4Bin(expr: string) {
  return `CAST(${expr} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_bin`;
}

function rmIdEqualsSql(column: string, param = ":rm_id") {
  return `${asUtf8mb4Bin(`TRIM(${column})`)} = ${asUtf8mb4Bin(`TRIM(${param})`)}`;
}

/** RM filter: regional_manager_id OR store_code (app often sends store code as rm_id). */
function storesRmWhereSql() {
  return `(${rmIdEqualsSql("s.regional_manager_id")} OR ${rmIdEqualsSql("s.store_code")})`;
}

const STORE_ADDRESS_SQL = `TRIM(BOTH ',' FROM CONCAT_WS(', ',
  CAST(IFNULL(sa.address_line_1, '') AS CHAR CHARACTER SET utf8mb4),
  CAST(IFNULL(sa.city, '') AS CHAR CHARACTER SET utf8mb4),
  CAST(IFNULL(sa.postal_code, '') AS CHAR CHARACTER SET utf8mb4)
))`;

export type StoresListInput = {
  rm_id: string;
  page?: unknown;
  limit?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  status?: unknown;
  business_type?: unknown;
  include_product_counts?: unknown;
  /** Optional — not in PHP list; kept for /stores/search alias */
  keyword?: unknown;
};

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type ProductStats = {
  loose_product_count: number;
  attribute_total: number;
  pending_variant_count: number;
  pending_count: number;
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

function includeProductCountsFlag(v: unknown) {
  if (v === undefined || v === null || v === "") return true;
  if (v === false || v === 0 || v === "0") return false;
  return Boolean(v);
}

type CountRow = RowDataPacket & { total: number };
type StatsRow = RowDataPacket & Record<string, number>;

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
  street: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
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
  plan_id: string | number | null;
  plan_title: string | null;
  plan_price: string | number | null;
  plan_product_limit: string | number | null;
  plan_description: string | null;
  slogan: string | null;
  slogan_title: string | null;
  tags: string | null;
  description: string | null;
  cancle_policy: string | null;
  base_distance: string | number | null;
  base_charge: string | number | null;
  extra_charge: string | number | null;
  remark: string | null;
  owner_name: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  aadhar_back: string | null;
  refercode: string | null;
  non_onboarded_store_id: string | null;
  non_onboarded_date: string | null;
  created_at: string | null;
};

async function fetchProductStatsLegacy(storeIds: number[]): Promise<Record<number, ProductStats>> {
  const stats: Record<number, ProductStats> = {};
  if (!storeIds.length) return stats;

  const idList = storeIds.map((id) => Number(id)).filter((id) => id > 0).join(",");
  if (!idList) return stats;

  const notDeleted = "(is_delete = 0 OR is_delete IS NULL)";
  const activeStatus = "(status = 1 OR status = '1')";
  const listFilter = `${notDeleted} AND ${activeStatus}`;
  const listFilterP = "(p.is_delete = 0 OR p.is_delete IS NULL) AND (p.status = 1 OR p.status = '1')";
  const notDeletedP = "(p.is_delete = 0 OR p.is_delete IS NULL)";
  const approvalExpr = "LOWER(TRIM(COALESCE(pa.approval_status, p.approval_status, '')))";
  const attrStatusExpr = "COALESCE(pa.status, '0')";
  const isPendingActive = `(${approvalExpr} NOT IN ('approved') OR ${attrStatusExpr} IN ('0', 0))`;

  const [prodRows] = await pool.query<StatsRow[]>(
    `
    SELECT
      store_id,
      SUM(CASE WHEN (loose_product = 1 OR loose_product = '1') AND ${listFilter} THEN 1 ELSE 0 END) AS loose_product_count
    FROM tbl_product
    WHERE store_id IN (${idList})
    GROUP BY store_id
    `,
  );

  for (const pr of prodRows ?? []) {
    const sid = Number(pr.store_id);
    stats[sid] = {
      loose_product_count: Number(pr.loose_product_count ?? 0),
      attribute_total: 0,
      pending_variant_count: 0,
      pending_count: 0,
    };
  }

  const [attrRows] = await pool.query<StatsRow[]>(
    `
    SELECT
      pa.store_id,
      SUM(CASE WHEN ${listFilterP} THEN 1 ELSE 0 END) AS attribute_total,
      SUM(CASE WHEN ${listFilterP} AND ${isPendingActive} THEN 1 ELSE 0 END) AS pending_variant_count
    FROM tbl_product_attribute pa
    INNER JOIN tbl_product p ON p.id = pa.product_id AND p.store_id = pa.store_id
    WHERE pa.store_id IN (${idList})
      AND ${notDeletedP}
    GROUP BY pa.store_id
    `,
  );

  for (const ar of attrRows ?? []) {
    const sid = Number(ar.store_id);
    if (!stats[sid]) {
      stats[sid] = { loose_product_count: 0, attribute_total: 0, pending_variant_count: 0, pending_count: 0 };
    }
    stats[sid].attribute_total = Number(ar.attribute_total ?? 0);
    stats[sid].pending_variant_count = Number(ar.pending_variant_count ?? 0);
  }

  const [prodPendingRows] = await pool.query<StatsRow[]>(
    `
    SELECT
      p.store_id,
      COUNT(*) AS product_pending_count
    FROM tbl_product p
    WHERE p.store_id IN (${idList})
      AND (p.is_delete = 0 OR p.is_delete IS NULL)
      AND (
        LOWER(TRIM(COALESCE(p.approval_status, ''))) NOT IN ('approved')
        OR (p.status = 0 OR p.status = '0')
      )
      AND NOT EXISTS (
        SELECT 1 FROM tbl_product_attribute pa
        WHERE pa.product_id = p.id AND pa.store_id = p.store_id
      )
    GROUP BY p.store_id
    `,
  );

  for (const pp of prodPendingRows ?? []) {
    const sid = Number(pp.store_id);
    if (!stats[sid]) {
      stats[sid] = { loose_product_count: 0, attribute_total: 0, pending_variant_count: 0, pending_count: 0 };
    }
    stats[sid].pending_count =
      Number(stats[sid].pending_variant_count ?? 0) + Number(pp.product_pending_count ?? 0);
  }

  for (const sid of Object.keys(stats)) {
    const st = stats[Number(sid)];
    if (st.pending_count === undefined || st.pending_count === 0) {
      st.pending_count = st.pending_variant_count ?? 0;
    }
  }

  return stats;
}

async function fetchProductStatsV2(storeIds: number[]): Promise<Record<number, ProductStats>> {
  const stats: Record<number, ProductStats> = {};
  if (!storeIds.length) return stats;

  const idList = storeIds.map((id) => Number(id)).filter((id) => id > 0).join(",");
  if (!idList) return stats;

  const productActive = "(p.is_deleted = 0 OR p.is_deleted IS NULL) AND p.status = 1";
  const variantActive =
    "(v.is_deleted = 0 OR v.is_deleted IS NULL) AND v.deleted_at IS NULL AND v.status = 1";
  const approvalVal = asUtf8mb4Bin("COALESCE(v.approval_status, p.approval_status, 'pending')");
  const isPendingActive = `(${approvalVal} <> ${asUtf8mb4Bin("'approved'")} OR v.status = 0)`;

  const [prodRows] = await pool.query<StatsRow[]>(
    `
    SELECT
      p.store_id,
      SUM(CASE WHEN p.is_loose_product = 1 AND ${productActive} THEN 1 ELSE 0 END) AS loose_product_count
    FROM products p
    WHERE p.store_id IN (${idList})
    GROUP BY p.store_id
    `,
  );

  for (const pr of prodRows ?? []) {
    const sid = Number(pr.store_id);
    stats[sid] = {
      loose_product_count: Number(pr.loose_product_count ?? 0),
      attribute_total: 0,
      pending_variant_count: 0,
      pending_count: 0,
    };
  }

  const [attrRows] = await pool.query<StatsRow[]>(
    `
    SELECT
      p.store_id,
      SUM(CASE WHEN ${productActive} AND ${variantActive} THEN 1 ELSE 0 END) AS attribute_total,
      SUM(CASE WHEN ${productActive} AND ${variantActive} AND ${isPendingActive} THEN 1 ELSE 0 END) AS pending_variant_count
    FROM product_variants v
    INNER JOIN products p ON p.id = v.product_id AND p.store_id IN (${idList})
    WHERE p.store_id IN (${idList})
    GROUP BY p.store_id
    `,
  );

  for (const ar of attrRows ?? []) {
    const sid = Number(ar.store_id);
    if (!stats[sid]) {
      stats[sid] = { loose_product_count: 0, attribute_total: 0, pending_variant_count: 0, pending_count: 0 };
    }
    stats[sid].attribute_total = Number(ar.attribute_total ?? 0);
    stats[sid].pending_variant_count = Number(ar.pending_variant_count ?? 0);
  }

  const [prodPendingRows] = await pool.query<StatsRow[]>(
    `
    SELECT
      p.store_id,
      COUNT(*) AS product_pending_count
    FROM products p
    WHERE p.store_id IN (${idList})
      AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      AND (
        ${asUtf8mb4Bin("COALESCE(p.approval_status, 'pending')")} <> ${asUtf8mb4Bin("'approved'")}
        OR p.status = 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM product_variants v
        WHERE v.product_id = p.id AND (v.is_deleted = 0 OR v.is_deleted IS NULL) AND v.deleted_at IS NULL
      )
    GROUP BY p.store_id
    `,
  );

  for (const pp of prodPendingRows ?? []) {
    const sid = Number(pp.store_id);
    if (!stats[sid]) {
      stats[sid] = { loose_product_count: 0, attribute_total: 0, pending_variant_count: 0, pending_count: 0 };
    }
    stats[sid].pending_count =
      Number(stats[sid].pending_variant_count ?? 0) + Number(pp.product_pending_count ?? 0);
  }

  for (const sid of Object.keys(stats)) {
    const st = stats[Number(sid)];
    if (!st.pending_count) {
      st.pending_count = st.pending_variant_count ?? 0;
    }
  }

  return stats;
}

function mapStoreRow(row: StoreRow, ps: ProductStats | null) {
  const variantTotal = ps?.attribute_total ?? 0;
  const pendingTotal = ps?.pending_count ?? 0;
  const approvedTotal = Math.max(0, variantTotal - pendingTotal);
  const nosId = row.non_onboarded_store_id ? s(row.non_onboarded_store_id) : null;

  return {
    id: row.id,
    business_name: row.business_name,
    email: row.email,
    mobile: row.mobile,
    full_address: row.full_address,
    pincode: row.pincode,
    business_type: String(row.business_type ?? "").replaceAll(",", ", "),
    category_ids: row.category_ids,
    opentime: row.opentime,
    closetime: row.closetime,
    location: row.landmark,
    latitude: row.latitude,
    longitude: row.longitude,
    zone_id: row.zone_id,
    bank_name: row.bank_name,
    street: row.street ?? "",
    area: row.area ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    ifsc: row.ifsc,
    account_holder_name: row.account_holder_name,
    account_number: row.account_number,
    transaction_id: row.transaction_id,
    status: row.status,
    rstatus: row.rstatus,
    rate: row.rate,
    commission: row.commission,
    store_banner: row.store_banner,
    cover_image_url: row.cover_image_url,
    registration_date: "",
    rm_id: row.rm_id,
    ra_id: row.ra_id,
    fr_id: row.fr_id,
    plan_id: row.plan_id,
    plan_opt: row.plan_title ?? "",
    plan_price: row.plan_price ?? "",
    plan_product_limit: row.plan_product_limit ?? "",
    plan_description: row.plan_description ?? "",
    total: String(variantTotal),
    product_count: String(variantTotal),
    pending_count: String(pendingTotal),
    approved_count: String(approvedTotal),
    loose_product_count: String(ps?.loose_product_count ?? 0),
    slogan: row.slogan,
    slogan_title: row.slogan_title,
    tags: row.tags,
    description: row.description,
    cancel_policy: row.cancle_policy,
    base_distance: row.base_distance,
    base_charge: row.base_charge,
    extra_charge: row.extra_charge,
    remark: row.remark,
    owner_name: row.owner_name ?? "N/A",
    refercode: row.refercode,
    break_start_time: row.break_start_time ?? null,
    break_end_time: row.break_end_time ?? null,
    aadhar_back: row.aadhar_back ?? null,
    store_type: nosId ? "non_onboard_store" : "onboard_store",
    non_onboarded_store_id: nosId,
    non_onboarded_date: row.non_onboarded_date ?? null,
    trnaseferdate: row.created_at ?? null,
  };
}

/** hellochotu_microservices `stores` + related tables (no service_details). */
async function storesListFromStoresTable(input: StoresListInput): Promise<ServiceResult> {
  const rm_id = s(input.rm_id);
  const page = toPage(input.page);
  const limit = toLimit(input.limit);
  const offset = (page - 1) * limit;
  const includeProductCounts = includeProductCountsFlag(input.include_product_counts);

  const whereParts: string[] = [storesRmWhereSql(), `(s.is_deleted = 0 OR s.is_deleted IS NULL)`];
  const params: Record<string, unknown> = { rm_id };

  const start_date = s(input.start_date);
  if (start_date) {
    whereParts.push("s.created_at >= :start_date");
    params.start_date = `${start_date} 00:00:00`;
  }

  const end_date = s(input.end_date);
  if (end_date) {
    whereParts.push("s.created_at <= :end_date");
    params.end_date = `${end_date} 23:59:59`;
  }

  const status = s(input.status);
  if (status) {
    whereParts.push("s.status = :status");
    params.status = status;
  }

  const business_type = s(input.business_type);
  if (business_type) {
    whereParts.push(`${asUtf8mb4Bin("s.location_code")} LIKE ${asUtf8mb4Bin(":business_type")}`);
    params.business_type = `%${business_type}%`;
  }

  const keyword = s(input.keyword);
  if (keyword) {
    whereParts.push(
      `(${asUtf8mb4Bin("s.name")} LIKE ${asUtf8mb4Bin(":kw")} OR ${asUtf8mb4Bin("sc.phone_number")} LIKE ${asUtf8mb4Bin(":kw")} OR ${asUtf8mb4Bin("sc.email")} LIKE ${asUtf8mb4Bin(":kw")})`,
    );
    params.kw = `%${keyword}%`;
  }

  const whereClause = whereParts.join(" AND ");

  try {
    const countFrom = keyword
      ? "stores s LEFT JOIN store_credentials sc ON sc.store_id = s.id"
      : "stores s";
    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(DISTINCT s.id) AS total FROM ${countFrom} WHERE ${whereClause}`,
      params as any,
    );
    const totalRecords = Number(countRows?.[0]?.total ?? 0);
    const totalPages = limit > 0 ? Math.ceil(totalRecords / limit) : 0;

    const [onboardedRows] = await pool.query<CountRow[]>(
      `
      SELECT COUNT(*) AS total FROM stores s
      WHERE (s.is_deleted = 0 OR s.is_deleted IS NULL)
        AND ${storesRmWhereSql()}
      `,
      { rm_id } as any,
    );
    const onboardedCount = Number(onboardedRows?.[0]?.total ?? 0);

    const [nonOnboardedRows] = await pool.query<CountRow[]>(
      `
      SELECT COUNT(*) AS total FROM non_onboarded_store
      WHERE is_deleted = 0
        AND ${rmIdEqualsSql("rm_id")}
      `,
      { rm_id } as any,
    );
    const nonOnboardedCount = Number(nonOnboardedRows?.[0]?.total ?? 0);

    const counts: Record<string, string> = {
      onboarded_count: String(onboardedCount),
      non_onboarded_count: String(nonOnboardedCount),
      total_count: String(onboardedCount + nonOnboardedCount),
    };

    const [rows] = await pool.query<StoreRow[]>(
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
        sa.street,
        sa.area,
        sa.city,
        sa.state,
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
        s.subscription_plan_id AS plan_id,
        NULL AS plan_title,
        NULL AS plan_price,
        NULL AS plan_product_limit,
        NULL AS plan_description,
        s.tagline AS slogan,
        NULL AS slogan_title,
        s.short_description AS tags,
        s.description,
        s.cancellation_policy AS cancle_policy,
        NULL AS base_distance,
        NULL AS base_charge,
        NULL AS extra_charge,
        NULL AS remark,
        s.owner_name,
        soh.break_start_time,
        soh.break_end_time,
        NULL AS aadhar_back,
        s.referral_code AS refercode,
        s.store_code AS non_onboarded_store_id,
        NULL AS non_onboarded_date,
        s.created_at AS created_at
      FROM stores s
      LEFT JOIN store_credentials sc ON sc.store_id = s.id
      LEFT JOIN store_addresses sa ON sa.store_id = s.id AND sa.is_default = 1
        AND (sa.is_deleted = 0 OR sa.is_deleted IS NULL)
      LEFT JOIN store_operating_hours soh ON soh.store_id = s.id
      LEFT JOIN store_payment_methods spm ON spm.store_id = s.id AND spm.is_primary = 1
        AND (spm.is_deleted = 0 OR spm.is_deleted IS NULL)
      WHERE ${whereClause}
      ORDER BY s.id DESC
      LIMIT :limit OFFSET :offset
      `,
      { ...params, limit, offset } as any,
    );

    const storeIds: number[] = [];
    if (includeProductCounts) {
      for (const row of rows ?? []) storeIds.push(Number(row.id));
    }

    const productStats = includeProductCounts ? await fetchProductStatsV2(storeIds) : {};
    const stores = (rows ?? []).map((row) => {
      const mapped = mapStoreRow(row, productStats[Number(row.id)] ?? null);
      mapped.store_type = "onboard_store";
      mapped.non_onboarded_store_id = null;
      return mapped;
    });

    let pageVariantTotal = 0;
    let pagePendingTotal = 0;
    let pageApprovedTotal = 0;
    for (const store of stores) {
      pageVariantTotal += Number(store.total ?? 0);
      pagePendingTotal += Number(store.pending_count ?? 0);
      pageApprovedTotal += Number(store.approved_count ?? 0);
    }

    counts.total = String(pageVariantTotal);
    counts.product_count = String(pageVariantTotal);
    counts.pending_count = String(pagePendingTotal);
    counts.approved_count = String(pageApprovedTotal);

    return {
      httpStatus: 200,
      body: {
        success: true,
        ResponseCode: "200",
        Result: "true",
        ResponseMsg:
          stores.length > 0
            ? "Store onboarding history retrieved successfully"
            : "No stores found for this RM ID",
        pagination: { total_records: totalRecords, total_pages: totalPages, current_page: page, limit },
        counts,
        total: String(pageVariantTotal),
        product_count: String(pageVariantTotal),
        pending_count: String(pagePendingTotal),
        approved_count: String(pageApprovedTotal),
        total_stores: stores.length,
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

export async function storesListService(input: StoresListInput): Promise<ServiceResult> {
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
    return storesListFromStoresTable(input);
  }

  const page = toPage(input.page);
  const limit = toLimit(input.limit);
  const offset = (page - 1) * limit;
  const includeProductCounts = includeProductCountsFlag(input.include_product_counts);

  const whereParts: string[] = [rmIdEqualsSql("sd.rm_id")];
  const params: Record<string, unknown> = { rm_id };

  const start_date = s(input.start_date);
  if (start_date) {
    whereParts.push("sd.created_at >= :start_date");
    params.start_date = `${start_date} 00:00:00`;
  }

  const end_date = s(input.end_date);
  if (end_date) {
    whereParts.push("sd.created_at <= :end_date");
    params.end_date = `${end_date} 23:59:59`;
  }

  const status = s(input.status);
  if (status) {
    whereParts.push("sd.status = :status");
    params.status = status;
  }

  const business_type = s(input.business_type);
  if (business_type) {
    whereParts.push("sd.lcode LIKE :business_type");
    params.business_type = `%${business_type}%`;
  }

  const keyword = s(input.keyword);
  if (keyword) {
    whereParts.push("(sd.title LIKE :kw OR sd.mobile LIKE :kw OR sd.email LIKE :kw)");
    params.kw = `%${keyword}%`;
  }

  const whereClause = whereParts.join(" AND ");

  try {
    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM service_details sd WHERE ${whereClause}`,
      params as any,
    );
    const totalRecords = Number(countRows?.[0]?.total ?? 0);
    const totalPages = limit > 0 ? Math.ceil(totalRecords / limit) : 0;

    const [onboardedRows] = await pool.query<CountRow[]>(
      `
      SELECT COUNT(*) AS total
      FROM service_details
      WHERE ${rmIdEqualsSql("rm_id")}
      `,
      { rm_id } as any,
    );
    const onboardedCount = Number(onboardedRows?.[0]?.total ?? 0);

    const [nonOnboardedRows] = await pool.query<CountRow[]>(
      `
      SELECT COUNT(*) AS total
      FROM non_onboarded_store
      WHERE is_deleted = 0
        AND ${rmIdEqualsSql("rm_id")}
      `,
      { rm_id } as any,
    );
    const nonOnboardedCount = Number(nonOnboardedRows?.[0]?.total ?? 0);

    const counts: Record<string, string> = {
      onboarded_count: String(onboardedCount),
      non_onboarded_count: String(nonOnboardedCount),
      total_count: String(onboardedCount + nonOnboardedCount),
    };

    const [rows] = await pool.query<StoreRow[]>(
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
        sd.street,
        sd.area,
        sd.city,
        sd.state,
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
        sd.plan_id,
        p.plan_title,
        p.price AS plan_price,
        p.product_limit AS plan_product_limit,
        p.description AS plan_description,
        sd.slogan,
        sd.slogan_title,
        sd.sdesc AS tags,
        sd.cdesc AS description,
        sd.cancle_policy,
        sd.ukm AS base_distance,
        sd.uprice AS base_charge,
        sd.aprice AS extra_charge,
        sd.remark,
        sd.owner_name,
        sd.break_start_time,
        sd.break_end_time,
        sd.aadhar_back,
        sd.refercode,
        sd.non_onboarded_store_id,
        sd.non_onboarded_date,
        sd.created_at AS created_at
      FROM service_details sd
      LEFT JOIN tbl_joining_plan p ON sd.plan_id = p.id
      WHERE ${whereClause}
      ORDER BY sd.id DESC
      LIMIT :limit OFFSET :offset
      `,
      { ...params, limit, offset } as any,
    );

    const storeIds: number[] = [];
    if (includeProductCounts) {
      for (const row of rows ?? []) {
        storeIds.push(Number(row.id));
      }
    }

    const productStats = includeProductCounts
      ? useProductSchemaV2()
        ? await fetchProductStatsV2(storeIds)
        : await fetchProductStatsLegacy(storeIds)
      : {};

    const stores = (rows ?? []).map((row) => mapStoreRow(row, productStats[Number(row.id)] ?? null));

    let pageVariantTotal = 0;
    let pagePendingTotal = 0;
    let pageApprovedTotal = 0;
    for (const store of stores) {
      pageVariantTotal += Number(store.total ?? 0);
      pagePendingTotal += Number(store.pending_count ?? 0);
      pageApprovedTotal += Number(store.approved_count ?? 0);
    }

    counts.total = String(pageVariantTotal);
    counts.product_count = String(pageVariantTotal);
    counts.pending_count = String(pagePendingTotal);
    counts.approved_count = String(pageApprovedTotal);

    const responseMsg =
      stores.length > 0
        ? "Store onboarding history retrieved successfully"
        : "No stores found for this RM ID";

    return {
      httpStatus: 200,
      body: {
        success: true,
        ResponseCode: "200",
        Result: "true",
        ResponseMsg: responseMsg,
        pagination: {
          total_records: totalRecords,
          total_pages: totalPages,
          current_page: page,
          limit,
        },
        counts,
        total: String(pageVariantTotal),
        product_count: String(pageVariantTotal),
        pending_count: String(pagePendingTotal),
        approved_count: String(pageApprovedTotal),
        total_stores: stores.length,
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
