import { pool } from "../db/mysql";
import {
  buildStoreImageFiles,
  buildStorePayloadContext,
  normalizeStoreInput,
  parseStoreBreakTimes,
  s,
  toFloat,
  toInt,
} from "./store-onboarding.shared";
import { resolveOnboardingPlan } from "./plan.service";
import { sendOnboardingMessages } from "./sms.service";
import { formatStorePhoneIndia, mobileDigitsSql, storePhoneLast10 } from "../utils/phone";
import { kolkataDateTimeNow } from "../utils/kolkata-time";
import { type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

type ExistingMobileRow = RowDataPacket & { id: number; name: string | null };
type NonOnboardRow = RowDataPacket & { id: number; created_at: string };
type StoreCodeRow = RowDataPacket & { store_code: string };

async function generateStoreCode(conn: PoolConnection): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `ST${yy}${mm}`;

  const [rows] = await conn.query<StoreCodeRow[]>(
    `
    SELECT store_code
    FROM stores
    WHERE store_code LIKE :prefix
    ORDER BY store_code DESC
    LIMIT 1
    `,
    { prefix: `${prefix}%` } as any,
  );

  let nextNum = 1;
  const lastCode = rows?.[0]?.store_code;
  if (lastCode) {
    const lastNum = Number.parseInt(lastCode.slice(prefix.length), 10);
    if (Number.isFinite(lastNum)) nextNum = lastNum + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

function resolveNonOnboardedLookup(rawNos: string, rm_id: string) {
  let nosPk = 0;
  const m = /^SRID(\d+)$/i.exec(rawNos);
  if (m) nosPk = toInt(m[1], 0);
  else if (/^\d+$/.test(rawNos)) nosPk = toInt(rawNos, 0);

  const parts: string[] = [];
  const params: Record<string, unknown> = { rm_id, rawNos };
  if (nosPk > 0) {
    parts.push("id = :nosPk");
    params.nosPk = nosPk;
  }
  parts.push("TRIM(CAST(store_id AS CHAR)) = :rawNos");
  return { nosWhereOr: parts.join(" OR "), nosLookupParams: params };
}

async function softDeleteNonOnboardedStore(
  conn: PoolConnection,
  rawNos: string,
  rm_id: string,
  nosWhereOr: string,
  nosLookupParams: Record<string, unknown>,
) {
  if (!rawNos || !nosWhereOr) return;
  await conn
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

/** RM store onboarding for production `stores/*` schema (RM_SCHEMA_V2=true). */
export async function storeOnboardingV2Service(data: Record<string, unknown>): Promise<ServiceResult> {
  normalizeStoreInput(data);

  if (!s(data.rm_id)) {
    return { httpStatus: 400, body: { success: false, message: "rm_id is required and cannot be empty" } };
  }
  const rm_id = s(data.rm_id);

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

  const mobile = formatStorePhoneIndia(s(data.mobile));
  if (!mobile) {
    return {
      httpStatus: 400,
      body: {
        success: false,
        message: "Invalid mobile number. Must be a valid 10-digit India mobile.",
      },
    };
  }
  data.mobile = mobile;

  const last10 = storePhoneLast10(mobile);
  const business_name = s(data.business_name);
  const email = s(data.email);

  const digits = mobileDigitsSql("sc.phone_number");
  const [existing] = await pool.query<ExistingMobileRow[]>(
    `
    SELECT s.id, s.name
    FROM store_credentials sc
    INNER JOIN stores s ON s.id = sc.store_id
    WHERE (sc.is_deleted = 0 OR sc.is_deleted IS NULL)
      AND (s.is_deleted = 0 OR s.is_deleted IS NULL)
      AND (
        sc.phone_number = :mobile
        OR sc.phone_number LIKE :mobileLike
        OR ${digits} = :last10
      )
    LIMIT 1
    `,
    { mobile, mobileLike: `%${last10}`, last10 } as any,
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
        existing_store_name: ex.name ?? "",
      },
    };
  }

  const ctx = await buildStorePayloadContext(data);
  const planDetails = await resolveOnboardingPlan(ctx.plan_id);
  const subscriptionPlanId = planDetails?.id !== undefined && planDetails.id !== null ? Number(planDetails.id) : null;

  const business_type = s(data.business_type);
  const tagline = data.slogan !== undefined ? s(data.slogan) : ctx.storeMasterDefaults.slogan;
  const shortDescription = data.tags !== undefined ? s(data.tags) : ctx.storeMasterDefaults.sdesc;
  const description = data.description !== undefined ? s(data.description) : ctx.storeMasterDefaults.cdesc;
  const cancelPolicy =
    data.cancel_policy !== undefined ? s(data.cancel_policy) : ctx.storeMasterDefaults.cancle_policy;
  const logoUrl = s(data.store_banner) ? s(data.store_banner) : "images/dstore.png";
  const bannerUrl = s(data.cover_image_url) ? s(data.cover_image_url) : "images/store/1763721210.jpg";
  const baseDistance = data.base_distance !== undefined ? toFloat(data.base_distance, 5) : 5;
  const baseCharge = data.base_charge !== undefined ? toFloat(data.base_charge, 0) : 0;
  const extraCharge = data.extra_charge !== undefined ? toFloat(data.extra_charge, 0) : 0;
  const { breakStart, breakEnd } = parseStoreBreakTimes(data);

  const city = data.city !== undefined && s(data.city) !== "" ? s(data.city) : "Unknown";
  const state = data.state !== undefined && s(data.state) !== "" ? s(data.state) : "Unknown";
  const latitude = data.latitude !== undefined ? toFloat(data.latitude, 0) : 0;
  const longitude = data.longitude !== undefined ? toFloat(data.longitude, 0) : 0;

  const rawNos = s(data.non_onboarded_store_id);
  let nosWhereOr = "";
  let nosLookupParams: Record<string, unknown> = { rm_id };
  if (rawNos) {
    const lookup = resolveNonOnboardedLookup(rawNos, rm_id);
    nosWhereOr = lookup.nosWhereOr;
    nosLookupParams = lookup.nosLookupParams;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const nowKolkata = kolkataDateTimeNow();
    const store_code = await generateStoreCode(conn);

    const [storeResult] = await conn.query<ResultSetHeader>(
      `
      INSERT INTO stores (
        store_code, name, owner_name, tagline, short_description, description,
        logo_url, banner_url, location_code, category_ids, rating, status, zone_id,
        referral_code, regional_aggregator_id, franchisee_id, regional_manager_id,
        subscription_plan_id, years_in_business, cancellation_policy, is_review_enabled,
        language_code, is_deleted, created_at, updated_at
      ) VALUES (
        :store_code, :name, :owner_name, :tagline, :short_description, :description,
        :logo_url, :banner_url, :location_code, :category_ids, :rating, :status, :zone_id,
        :referral_code, :regional_aggregator_id, :franchisee_id, :regional_manager_id,
        :subscription_plan_id, :years_in_business, :cancellation_policy, 0, 'en', 0, :now_kolkata, :now_kolkata
      )
      `,
      {
        now_kolkata: nowKolkata,
        store_code,
        name: business_name,
        owner_name: data.owner_name !== undefined ? s(data.owner_name) : "",
        tagline,
        short_description: shortDescription,
        description,
        logo_url: logoUrl,
        banner_url: bannerUrl,
        location_code: business_type,
        category_ids: ctx.categoryIds,
        rating: 4.9,
        status: 1,
        zone_id: ctx.zoneId,
        referral_code: data.refercode !== undefined ? s(data.refercode) : "",
        regional_aggregator_id: ctx.ra_id,
        franchisee_id: ctx.fr_id,
        regional_manager_id: ctx.rm_id,
        subscription_plan_id: Number.isFinite(subscriptionPlanId) ? subscriptionPlanId : null,
        years_in_business:
          data.years_in_business !== undefined ? String(toInt(data.years_in_business, 0)) : "0",
        cancellation_policy: cancelPolicy,
      } as any,
    );

    const storeId = Number(storeResult.insertId);

    await conn.query(
      `
      INSERT INTO store_credentials (
        store_id, email, phone_number, password_hash, access_token, is_deleted, created_at, updated_at
      ) VALUES (
        :store_id, :email, :phone_number, :password_hash, :access_token, 0, :now_kolkata, :now_kolkata
      )
      `,
      {
        now_kolkata: nowKolkata,
        store_id: storeId,
        email: email || null,
        phone_number: mobile,
        password_hash: s(data.password),
        access_token: data.token !== undefined ? s(data.token) : null,
      } as any,
    );

    await conn.query(
      `
      INSERT INTO store_addresses (
        store_id, address_line_1, street, area, city, state, postal_code, country,
        landmark, latitude, longitude, address_type, is_default, is_deleted, created_at, updated_at
      ) VALUES (
        :store_id, :address_line_1, :street, :area, :city, :state, :postal_code, 'India',
        :landmark, :latitude, :longitude, 'primary', 1, 0, :now_kolkata, :now_kolkata
      )
      `,
      {
        now_kolkata: nowKolkata,
        store_id: storeId,
        address_line_1: s(data.full_address),
        street: data.street !== undefined ? s(data.street) : null,
        area: data.area !== undefined ? s(data.area) : null,
        city,
        state,
        postal_code: ctx.pincode || "",
        landmark: data.location !== undefined ? s(data.location) : null,
        latitude,
        longitude,
      } as any,
    );

    const bankName = data.bank_name !== undefined ? s(data.bank_name) : "";
    const ifsc = data.ifsc !== undefined ? s(data.ifsc) : "";
    const accountHolder = data.account_holder_name !== undefined ? s(data.account_holder_name) : "";
    const accountNumber = data.account_number !== undefined ? s(data.account_number) : "";
    if (bankName || ifsc || accountHolder || accountNumber) {
      await conn.query(
        `
        INSERT INTO store_payment_methods (
          store_id, payment_method_type, bank_name, ifsc_code, account_holder_name,
          account_number, is_primary, is_deleted, created_at, updated_at
        ) VALUES (
          :store_id, 'bank_account', :bank_name, :ifsc_code, :account_holder_name,
          :account_number, 1, 0, :now_kolkata, :now_kolkata
        )
        `,
        {
          now_kolkata: nowKolkata,
          store_id: storeId,
          bank_name: bankName || null,
          ifsc_code: ifsc || null,
          account_holder_name: accountHolder || null,
          account_number: accountNumber || null,
        } as any,
      );
    }

    const upiId = data.transaction_id !== undefined ? s(data.transaction_id) : "";
    if (upiId) {
      await conn.query(
        `
        INSERT INTO store_payment_methods (
          store_id, payment_method_type, upi_id, is_primary, is_deleted, created_at, updated_at
        ) VALUES (
          :store_id, 'upi', :upi_id, 0, 0, :now_kolkata, :now_kolkata
        )
        `,
        { now_kolkata: nowKolkata, store_id: storeId, upi_id: upiId } as any,
      );
    }

    for (let day = 0; day <= 6; day += 1) {
      await conn.query(
        `
        INSERT INTO store_operating_hours (
          store_id, day_of_week, is_open, opening_time, closing_time,
          break_start_time, break_end_time, is_24_hours, created_at, updated_at
        ) VALUES (
          :store_id, :day_of_week, 1, :opening_time, :closing_time,
          :break_start_time, :break_end_time, 0, :now_kolkata, :now_kolkata
        )
        `,
        {
          now_kolkata: nowKolkata,
          store_id: storeId,
          day_of_week: day,
          opening_time: ctx.opentime,
          closing_time: ctx.closetime,
          break_start_time: breakStart || null,
          break_end_time: breakEnd || null,
        } as any,
      );
    }

    await conn.query(
      `
      INSERT INTO store_pricing_settings (
        store_id, minimum_order_amount, delivery_charge, store_service_charge,
        platform_commission_rate, pricing_model, price_per_km, base_price, additional_price,
        cancellation_policy, is_deleted, created_at, updated_at
      ) VALUES (
        :store_id, 0, 0, 0, :platform_commission_rate, 'per_km', :price_per_km,
        :base_price, :additional_price, :cancellation_policy, 0, :now_kolkata, :now_kolkata
      )
      `,
      {
        now_kolkata: nowKolkata,
        store_id: storeId,
        platform_commission_rate: ctx.commission,
        price_per_km: baseDistance,
        base_price: baseCharge,
        additional_price: extraCharge,
        cancellation_policy: cancelPolicy,
      } as any,
    );

    await conn.query(
      `
      INSERT INTO store_delivery_settings (
        store_id, is_delivery_enabled, is_pickup_enabled, delivery_radius_km, is_deleted, created_at, updated_at
      ) VALUES (
        :store_id, 1, 1, :delivery_radius_km, 0, :now_kolkata, :now_kolkata
      )
      `,
      { now_kolkata: nowKolkata, store_id: storeId, delivery_radius_km: baseDistance } as any,
    );

    await softDeleteNonOnboardedStore(conn, rawNos, rm_id, nosWhereOr, nosLookupParams);

    await conn.commit();

    let sms_res: unknown = null;
    try {
      const ownerName = s(data.owner_name) || business_name;
      sms_res = await sendOnboardingMessages(mobile, ownerName, planDetails?.price ?? 0);
    } catch (e) {
      sms_res = { error: e instanceof Error ? e.message : String(e) };
    }

    const image_files = buildStoreImageFiles(data, logoUrl, bannerUrl);

    return {
      httpStatus: 201,
      body: {
        success: true,
        message: "Store added successfully",
        action: "created",
        store_id: storeId,
        store_name: business_name,
        email,
        image_files,
        sms_response: sms_res,
      },
    };
  } catch (e) {
    await conn.rollback();
    const msg = e instanceof Error ? e.message : String(e);
    return { httpStatus: 500, body: { success: false, message: `Database error: ${msg}` } };
  } finally {
    conn.release();
  }
}
