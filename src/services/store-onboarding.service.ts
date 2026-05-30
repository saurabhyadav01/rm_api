import { pool } from "../db/mysql";
import { useStoresTable } from "../config/schema";
import { resolveOnboardingPlan } from "./plan.service";
import { sendOnboardingMessages } from "./sms.service";
import { storeOnboardingV2Service } from "./store-onboarding-v2.service";
import { resolveDefaultZoneId } from "./store-onboarding.shared";
import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toFloat(v: unknown, fallback: number) {
  const n = Number(s(v));
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: unknown, fallback: number) {
  const n = Number(s(v));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseLatLong(input: unknown): { latitude?: string; longitude?: string } {
  const v = s(input);
  if (!v) return {};
  // Try JSON: {"lat":..,"lng":..}
  try {
    const j = JSON.parse(v) as any;
    if (j && j.lat !== undefined && j.lng !== undefined) {
      return { latitude: String(j.lat), longitude: String(j.lng) };
    }
  } catch {
    // ignore
  }
  // Try "lat,lng" or "lat lng"
  const parts = v.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { latitude: parts[0], longitude: parts[1] };
  return {};
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
type CategoryRow = RowDataPacket & { id: number; title: string };
type ExistingMobileRow = RowDataPacket & { id: number; title: string };
type NonOnboardRow = RowDataPacket & { id: number; created_at: string };

function normalizeBusinessName(data: Record<string, unknown>) {
  if (!data.business_name && data.title) data.business_name = data.title;
  if (!data.business_name && data.shop_name) data.business_name = data.shop_name;
  if (!data.mobile && data.phone_no) data.mobile = data.phone_no;
  if (!data.full_address && data.address_line) data.full_address = data.address_line;
}

/** PHP strtotime + date('H:i:s') */
function parseTimeToHms(input: unknown, fallback: string): string {
  const v = s(input);
  if (!v) return fallback;
  const ts = Date.parse(`1970-01-01 ${v}`);
  if (Number.isFinite(ts)) {
    const d = new Date(ts);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (m) {
    const hh = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const ss = (m[3] ?? "00").padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return fallback;
}

function buildTimeSlots(openTime: string, closeTime: string, breakStart?: string | null, breakEnd?: string | null) {
  const openTs = Date.parse(`1970-01-01T${openTime}`);
  const closeTs = Date.parse(`1970-01-01T${closeTime}`);
  const bStartTs = breakStart ? Date.parse(`1970-01-01T${breakStart}`) : NaN;
  const bEndTs = breakEnd ? Date.parse(`1970-01-01T${breakEnd}`) : NaN;

  const totalMinutes = (closeTs - openTs) / 60000;
  const breakValid = Number.isFinite(bStartTs) && Number.isFinite(bEndTs) && bStartTs > openTs && bEndTs < closeTs && bEndTs > bStartTs;
  const breakMinutes = breakValid ? (bEndTs - bStartTs) / 60000 : 0;
  const effectiveMinutes = Math.max(0, totalMinutes - breakMinutes);
  const slotDuration = effectiveMinutes / 3;

  const advanceSkippingBreak = (start: number, minutes: number) => {
    let sTs = start;
    if (breakValid && sTs >= bStartTs && sTs < bEndTs) sTs = bEndTs;
    let eTs = sTs + minutes * 60000;
    if (breakValid && sTs < bStartTs && eTs > bStartTs) eTs += bEndTs - bStartTs;
    return eTs;
  };

  const slot1End = advanceSkippingBreak(openTs, slotDuration);
  const slot2End = advanceSkippingBreak(slot1End, slotDuration);
  const slot3End = closeTs;

  const fmt = (ts: number) => new Date(ts).toISOString().slice(11, 19);
  return [
    { mintime: fmt(openTs), maxtime: fmt(Math.min(slot1End, closeTs)) },
    { mintime: fmt(Math.min(slot1End, closeTs)), maxtime: fmt(Math.min(slot2End, closeTs)) },
    { mintime: fmt(Math.min(slot2End, closeTs)), maxtime: fmt(slot3End) },
  ];
}

export async function storeOnboardingService(data: Record<string, unknown>): Promise<ServiceResult> {
  if (useStoresTable()) {
    return storeOnboardingV2Service(data);
  }

  normalizeBusinessName(data);

  // Defaults
  const ra_id = data.ra_id ? s(data.ra_id) : "ra01";
  const fr_id = data.fr_id ? s(data.fr_id) : "fr01";

  if (!s(data.rm_id)) {
    return { httpStatus: 400, body: { success: false, message: "rm_id is required and cannot be empty" } };
  }
  const rm_id = s(data.rm_id);

  const plan_id = data.retailer_fees ? s(data.retailer_fees) : "1";

  // latlong normalization into latitude/longitude
  if (data.latlong && (!data.latitude || !data.longitude)) {
    const ll = parseLatLong(data.latlong);
    if (ll.latitude !== undefined) data.latitude = ll.latitude;
    if (ll.longitude !== undefined) data.longitude = ll.longitude;
  }

  // Required fields (only mobile)
  if (!s(data.mobile)) {
    return {
      httpStatus: 400,
      body: {
        success: false,
        message: "Missing required fields: mobile",
        required_fields: ["mobile"],
        received_fields: Object.keys(data),
      },
    };
  }

  const mobile = s(data.mobile);

  // Duplicate mobile check
  const [existing] = await pool.query<ExistingMobileRow[]>(
    "SELECT id, title FROM service_details WHERE mobile = :mobile LIMIT 1",
    { mobile } as any,
  );
  if (existing?.length) {
    const ex = existing[0];
    return {
      httpStatus: 409,
      body: {
        success: false,
        message: "Mobile number already exists",
        error_code: "DUPLICATE_MOBILE",
        existing_store_id: ex.id,
        existing_store_name: ex.title,
      },
    };
  }

  // Pincode extraction
  let pincode = s(data.pincode);
  const full_address = s(data.full_address);
  if (!pincode && full_address) {
    const m = /\b\d{6}\b/.exec(full_address);
    if (m) pincode = m[0];
  }

  const opentime = parseTimeToHms(data.opentime, "09:00:00");
  const closetime = parseTimeToHms(data.closetime, "22:00:00");

  // zone_id lookup (India) — optional legacy table
  const zoneId = await resolveDefaultZoneId();

  // store master defaults
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
        if (master.commission !== null && master.commission !== undefined && String(master.commission).trim() !== "") {
          const c = Number(master.commission);
          if (Number.isFinite(c)) storeMasterDefaults.commission = c;
        }
      }
    }
  }

  const commission = data.retailer_fees !== undefined && data.retailer_fees !== null && s(data.retailer_fees) !== ""
    ? toFloat(data.retailer_fees, storeMasterDefaults.commission)
    : storeMasterDefaults.commission;

  // category IDs from tbl_category based on business_type
  let categoryIds = "13";
  if (business_type) {
    const types = business_type.split(",").map((x) => x.trim()).filter(Boolean);
    const found: number[] = [];
    for (const t of types) {
      const [catRows] = await pool.query<CategoryRow[]>(
        "SELECT id, title FROM tbl_category WHERE LOWER(title) = LOWER(:title) LIMIT 1",
        { title: t } as any,
      );
      if (catRows?.[0]?.id) found.push(Number(catRows[0].id));
    }
    if (found.length) categoryIds = found.join(",");
  }

  // non_onboarded_store_id lookup and soft delete after insert
  const rawNos = s(data.non_onboarded_store_id);
  let non_onboarded_date_for_insert: string | null = null;
  let nosWhereOr = "";
  let nosLookupParams: Record<string, unknown> = { rm_id };
  if (rawNos) {
    let nosPk = 0;
    const m = /^SRID(\d+)$/i.exec(rawNos);
    if (m) nosPk = toInt(m[1], 0);
    else if (/^\d+$/.test(rawNos)) nosPk = toInt(rawNos, 0);

    const parts: string[] = [];
    nosLookupParams = { rm_id };
    if (nosPk > 0) {
      parts.push("id = :nosPk");
      nosLookupParams.nosPk = nosPk;
    }
    parts.push("TRIM(CAST(store_id AS CHAR)) = :rawNos");
    nosLookupParams.rawNos = rawNos;
    nosWhereOr = parts.join(" OR ");

    const [nosRows] = await pool.query<NonOnboardRow[]>(
      `
      SELECT id, created_at
      FROM non_onboarded_store
      WHERE is_deleted = 0
        AND (CONVERT(CAST(rm_id AS CHAR) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
          = (CONVERT(:rm_id USING utf8mb4) COLLATE utf8mb4_unicode_ci)
        AND (${nosWhereOr})
      LIMIT 1
      `,
      nosLookupParams as any,
    );
    if (nosRows?.[0]?.created_at) non_onboarded_date_for_insert = String(nosRows[0].created_at);
  }

  const business_name = s(data.business_name);
  const email = s(data.email);

  const insertData: Record<string, unknown> = {
    ra_id,
    fr_id,
    rm_id,
    plan_id,

    title: business_name,
    email,
    password: s(data.password),
    mobile,
    full_address,
    pincode,
    street: data.street !== undefined ? s(data.street) : null,
    area: data.area !== undefined ? s(data.area) : null,
    city: data.city !== undefined ? s(data.city) : null,
    state: data.state !== undefined ? s(data.state) : null,

    lcode: business_type,

    opentime,
    closetime,
    break_start_time: data.break_start_time ? s(data.break_start_time) : (data.breakstarttime ? s(data.breakstarttime) : null),
    break_end_time: data.break_end_time ? s(data.break_end_time) : null,

    landmark: data.location !== undefined ? s(data.location) : "",
    lats: data.latitude !== undefined ? s(data.latitude) : "0",
    longs: data.longitude !== undefined ? s(data.longitude) : "0",
    zone_id: zoneId,

    catid: categoryIds,

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
    commission,

    ukm: data.base_distance !== undefined ? toFloat(data.base_distance, 5) : 5,
    uprice: data.base_charge !== undefined ? toFloat(data.base_charge, 0) : 0,
    aprice: data.extra_charge !== undefined ? toFloat(data.extra_charge, 0) : 0,

    slogan: data.slogan !== undefined ? s(data.slogan) : storeMasterDefaults.slogan,
    slogan_title: data.slogan_subtitle !== undefined ? s(data.slogan_subtitle) : storeMasterDefaults.slogan_title,
    sdesc: data.tags !== undefined ? s(data.tags) : storeMasterDefaults.sdesc,
    cdesc: data.description !== undefined ? s(data.description) : storeMasterDefaults.cdesc,
    cancle_policy: data.cancel_policy !== undefined ? s(data.cancel_policy) : storeMasterDefaults.cancle_policy,

    rimg: s(data.store_banner) ? s(data.store_banner) : "images/dstore.png",
    cover_img: s(data.cover_image_url) ? s(data.cover_image_url) : "images/store/1763721210.jpg",
    aadhar_back: s(data.aadhar_back) ? s(data.aadhar_back) : null,

    remark: data.remark !== undefined ? s(data.remark) : "",
    refercode: data.refercode !== undefined ? s(data.refercode) : "",
    token: data.token !== undefined ? s(data.token) : "",
    owner_name: data.owner_name !== undefined ? s(data.owner_name) : "",
    years_in_business: data.years_in_business !== undefined ? toInt(data.years_in_business, 0) : 0,
    onboardby: "By_RM",
  };

  if (rawNos) insertData.non_onboarded_store_id = rawNos;
  if (non_onboarded_date_for_insert) insertData.non_onboarded_date = non_onboarded_date_for_insert;

  const columns = Object.keys(insertData);
  const placeholders = columns.map((c) => `:${c}`).join(", ");

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO service_details (${columns.join(", ")}) VALUES (${placeholders})`,
      insertData as any,
    );

    const insertedId = Number(result.insertId);

    if (rawNos && nosWhereOr) {
      await pool
        .query(
          `
        UPDATE non_onboarded_store
        SET is_deleted = 1
        WHERE is_deleted = 0
          AND (CONVERT(CAST(rm_id AS CHAR) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
            = (CONVERT(:rm_id USING utf8mb4) COLLATE utf8mb4_unicode_ci)
          AND (${nosWhereOr})
        `,
          nosLookupParams as any,
        )
        .catch(() => {});
    }

    // Time slots: uses open_time/close_time for slot generation in PHP (different field names)
    const open_time = data.open_time ? s(data.open_time) : "09:00:00";
    const close_time = data.close_time ? s(data.close_time) : "21:00:00";
    const breakStart = insertData.break_start_time ? String(insertData.break_start_time) : null;
    const breakEnd = insertData.break_end_time ? String(insertData.break_end_time) : null;
    const slots = buildTimeSlots(open_time, close_time, breakStart, breakEnd);
    for (const slot of slots) {
      await pool.query(
        "INSERT INTO tbl_time (store_id, mintime, maxtime, status) VALUES (:store_id, :mintime, :maxtime, 1)",
        { store_id: insertedId, mintime: slot.mintime, maxtime: slot.maxtime } as any,
      );
    }

    let sms_res: unknown = null;
    try {
      const planDetails = await resolveOnboardingPlan(plan_id);
      const ownerName = s(data.owner_name) || business_name;
      sms_res = await sendOnboardingMessages(mobile, ownerName, planDetails.price);
    } catch (e) {
      sms_res = { error: e instanceof Error ? e.message : String(e) };
    }

    const image_files: Record<string, unknown> = {
      bank_proof_doc: data.bank_proof_doc ?? "null",
      aadhar_doc: data.aadhar_doc ?? "null",
      pan_doc: data.pan_doc ?? "null",
      address_proof_doc: data.address_proof_doc ?? "null",
      business_reg_doc: data.business_reg_doc ?? "null",
      transaction_receipt: data.transaction_receipt ?? "null",
      retailer_signature: data.retailer_signature ?? "null",
      store_banner: insertData.rimg,
      cover_image_url: insertData.cover_img,
    };

    return {
      httpStatus: 201,
      body: {
        success: true,
        message: "Store added successfully",
        action: "created",
        store_id: insertedId,
        store_name: business_name,
        email,
        image_files,
        sms_response: sms_res,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { httpStatus: 500, body: { success: false, message: `Database error: ${msg}` } };
  }
}

