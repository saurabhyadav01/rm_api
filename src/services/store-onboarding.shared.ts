import { pool } from "../db/mysql";
import { useProductSchemaV2 } from "../config/schema";
import { type RowDataPacket } from "mysql2/promise";

export function s(v: unknown) {
  return String(v ?? "").trim();
}

export function toFloat(v: unknown, fallback: number) {
  const n = Number(s(v));
  return Number.isFinite(n) ? n : fallback;
}

export function toInt(v: unknown, fallback: number) {
  const n = Number(s(v));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function normalizeStoreInput(data: Record<string, unknown>) {
  if (!data.business_name && data.title) data.business_name = data.title;
  if (!data.business_name && data.shop_name) data.business_name = data.shop_name;
  if (!data.mobile && data.phone_no) data.mobile = data.phone_no;
  if (!data.full_address && data.address_line) data.full_address = data.address_line;
}

export function parseLatLong(input: unknown): { latitude?: string; longitude?: string } {
  const v = s(input);
  if (!v) return {};
  try {
    const j = JSON.parse(v) as { lat?: unknown; lng?: unknown };
    if (j && j.lat !== undefined && j.lng !== undefined) {
      return { latitude: String(j.lat), longitude: String(j.lng) };
    }
  } catch {
    // ignore
  }
  const parts = v.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { latitude: parts[0], longitude: parts[1] };
  return {};
}

export function parseTimeToHms(input: unknown, fallback: string): string {
  const v = s(input);
  if (!v) return fallback;
  const ts = Date.parse(`1970-01-01 ${v}`);
  if (Number.isFinite(ts)) {
    const d = new Date(ts);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (m) return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}:${(m[3] ?? "00").padStart(2, "0")}`;
  return fallback;
}

type ZoneRow = RowDataPacket & { id: number };
type StoreMasterRow = RowDataPacket & {
  slogan_title: string | null;
  slogan_subtitle: string | null;
  tag: string | null;
  short_description: string | null;
  cancel_policy: string | null;
  commission: string | number | null;
};
type CategoryRow = RowDataPacket & { id: number };

export type StorePayloadContext = {
  ra_id: string;
  fr_id: string;
  rm_id: string;
  plan_id: string;
  opentime: string;
  closetime: string;
  zoneId: number;
  categoryIds: string;
  commission: number;
  storeMasterDefaults: {
    slogan: string;
    slogan_title: string;
    sdesc: string;
    cdesc: string;
    cancle_policy: string;
    commission: number;
  };
  pincode: string;
};

export async function buildStorePayloadContext(data: Record<string, unknown>): Promise<StorePayloadContext> {
  const ra_id = data.ra_id ? s(data.ra_id) : "ra01";
  const fr_id = data.fr_id ? s(data.fr_id) : "fr01";
  const rm_id = s(data.rm_id);
  const plan_id = data.retailer_fees ? s(data.retailer_fees) : "1";

  if (data.latlong && (!data.latitude || !data.longitude)) {
    const ll = parseLatLong(data.latlong);
    if (ll.latitude !== undefined) data.latitude = ll.latitude;
    if (ll.longitude !== undefined) data.longitude = ll.longitude;
  }

  let pincode = s(data.pincode);
  const full_address = s(data.full_address);
  if (!pincode && full_address) {
    const m = /\b\d{6}\b/.exec(full_address);
    if (m) pincode = m[0];
  }

  const opentime = parseTimeToHms(data.opentime, "09:00:00");
  const closetime = parseTimeToHms(data.closetime, "22:00:00");

  let zoneId = 1;
  const [zoneRows] = await pool.query<ZoneRow[]>("SELECT id FROM zones WHERE LOWER(title) LIKE '%india%' LIMIT 1");
  if (zoneRows?.[0]?.id) zoneId = Number(zoneRows[0].id);

  const storeMasterDefaults = {
    slogan: "Fresh & Fast",
    slogan_title: "Quality Service",
    sdesc: "food,delivery,fresh",
    cdesc: "Quality food and service",
    cancle_policy: "Cancellation allowed before order confirmation",
    commission: 5,
  };

  const business_type = s(data.business_type);
  if (business_type) {
    const first = business_type.split(",")[0]?.trim() ?? "";
    if (first) {
      const [masterRows] = await pool.query<StoreMasterRow[]>(
        `
        SELECT slogan_title, slogan_subtitle, tag, short_description, cancel_policy, commission
        FROM tbl_store_master
        WHERE category_title = :category_title
        LIMIT 1
        `,
        { category_title: first } as any,
      );
      const master = masterRows?.[0];
      if (master) {
        if (master.slogan_title) storeMasterDefaults.slogan = master.slogan_title;
        if (master.slogan_subtitle) storeMasterDefaults.slogan_title = master.slogan_subtitle;
        if (master.tag) storeMasterDefaults.sdesc = master.tag;
        if (master.short_description) storeMasterDefaults.cdesc = master.short_description;
        if (master.cancel_policy) storeMasterDefaults.cancle_policy = master.cancel_policy;
        if (master.commission !== null && master.commission !== undefined && s(master.commission) !== "") {
          const c = Number(master.commission);
          if (Number.isFinite(c)) storeMasterDefaults.commission = c;
        }
      }
    }
  }

  const commission =
    data.retailer_fees !== undefined && data.retailer_fees !== null && s(data.retailer_fees) !== ""
      ? toFloat(data.retailer_fees, storeMasterDefaults.commission)
      : storeMasterDefaults.commission;

  let categoryIds = "13";
  if (business_type) {
    const types = business_type.split(",").map((x) => x.trim()).filter(Boolean);
    const found: number[] = [];
    for (const t of types) {
      if (useProductSchemaV2()) {
        const [catRows] = await pool.query<CategoryRow[]>(
          `
          SELECT id
          FROM categories
          WHERE LOWER(name) = LOWER(:title)
            AND status = 1
            AND (is_deleted = 0 OR is_deleted IS NULL)
          LIMIT 1
          `,
          { title: t } as any,
        );
        if (catRows?.[0]?.id) {
          found.push(Number(catRows[0].id));
          continue;
        }
      }
      const [catRows] = await pool.query<CategoryRow[]>(
        "SELECT id FROM tbl_category WHERE LOWER(title) = LOWER(:title) LIMIT 1",
        { title: t } as any,
      );
      if (catRows?.[0]?.id) found.push(Number(catRows[0].id));
    }
    if (found.length) categoryIds = found.join(",");
  }

  return {
    ra_id,
    fr_id,
    rm_id,
    plan_id,
    opentime,
    closetime,
    zoneId,
    categoryIds,
    commission,
    storeMasterDefaults,
    pincode,
  };
}

/** Fields written to service_details — insert includes extra columns vs PHP update. */
export function buildServiceDetailsFields(
  data: Record<string, unknown>,
  ctx: StorePayloadContext,
  mode: "insert" | "update",
): Record<string, unknown> {
  const business_name = s(data.business_name);
  const business_type = s(data.business_type);

  const base: Record<string, unknown> = {
    ra_id: ctx.ra_id,
    fr_id: ctx.fr_id,
    rm_id: ctx.rm_id,
    plan_id: ctx.plan_id,
    title: business_name,
    email: s(data.email),
    password: s(data.password),
    mobile: s(data.mobile),
    full_address: s(data.full_address),
    pincode: ctx.pincode,
    lcode: business_type,
    opentime: ctx.opentime,
    closetime: ctx.closetime,
    landmark: data.location !== undefined ? s(data.location) : "",
    lats: data.latitude !== undefined ? s(data.latitude) : "0",
    longs: data.longitude !== undefined ? s(data.longitude) : "0",
    zone_id: ctx.zoneId,
    catid: ctx.categoryIds,
    bank_name: data.bank_name !== undefined ? s(data.bank_name) : "",
    ifsc: data.ifsc !== undefined ? s(data.ifsc) : "",
    receipt_name: data.account_holder_name !== undefined ? s(data.account_holder_name) : "",
    acc_number: data.account_number !== undefined ? s(data.account_number) : "",
    upi_id: data.transaction_id !== undefined ? s(data.transaction_id) : "",
    paypal_id: "",
    status: 1,
    rstatus: 1,
    rate: 4.9,
    is_pickup: 1,
    charge_type: 1,
    dcharge: 0,
    store_charge: 0,
    morder: 0,
    commission: ctx.commission,
    ukm: data.base_distance !== undefined ? toFloat(data.base_distance, 5) : 5,
    uprice: data.base_charge !== undefined ? toFloat(data.base_charge, 0) : 0,
    aprice: data.extra_charge !== undefined ? toFloat(data.extra_charge, 0) : 0,
    slogan: data.slogan !== undefined ? s(data.slogan) : ctx.storeMasterDefaults.slogan,
    slogan_title: data.slogan_subtitle !== undefined ? s(data.slogan_subtitle) : ctx.storeMasterDefaults.slogan_title,
    sdesc: data.tags !== undefined ? s(data.tags) : ctx.storeMasterDefaults.sdesc,
    cdesc: data.description !== undefined ? s(data.description) : ctx.storeMasterDefaults.cdesc,
    cancle_policy: data.cancel_policy !== undefined ? s(data.cancel_policy) : ctx.storeMasterDefaults.cancle_policy,
    rimg: s(data.store_banner) ? s(data.store_banner) : "images/dstore.png",
    cover_img: s(data.cover_image_url) ? s(data.cover_image_url) : "images/store/1763721210.jpg",
    remark: data.remark !== undefined ? s(data.remark) : "",
    refercode: data.refercode !== undefined ? s(data.refercode) : "",
    token: data.token !== undefined ? s(data.token) : "",
    owner_name: data.owner_name !== undefined ? s(data.owner_name) : "",
  };

  if (mode === "insert") {
    base.street = data.street !== undefined ? s(data.street) : null;
    base.area = data.area !== undefined ? s(data.area) : null;
    base.city = data.city !== undefined ? s(data.city) : null;
    base.state = data.state !== undefined ? s(data.state) : null;
    base.break_start_time = data.break_start_time
      ? s(data.break_start_time)
      : data.breakstarttime
        ? s(data.breakstarttime)
        : null;
    base.break_end_time = data.break_end_time ? s(data.break_end_time) : null;
    base.aadhar_back = s(data.aadhar_back) ? s(data.aadhar_back) : null;
    base.years_in_business = data.years_in_business !== undefined ? toInt(data.years_in_business, 0) : 0;
    base.onboardby = "By_RM";
    if (!s(data.password)) base.password = "";
  }

  return base;
}

export function buildStoreImageFiles(data: Record<string, unknown>, storeBanner: unknown, coverImage: unknown) {
  const image_files: Record<string, unknown> = {
    bank_proof_doc: data.bank_proof_doc ?? null,
    aadhar_doc: data.aadhar_doc ?? null,
    pan_doc: data.pan_doc ?? null,
    address_proof_doc: data.address_proof_doc ?? null,
    business_reg_doc: data.business_reg_doc ?? null,
    transaction_receipt: data.transaction_receipt ?? null,
    retailer_signature: data.retailer_signature ?? null,
    store_banner: storeBanner,
    cover_image_url: coverImage,
  };
  return Object.fromEntries(Object.entries(image_files).filter(([, v]) => v != null && v !== ""));
}
