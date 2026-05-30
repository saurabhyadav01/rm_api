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
import { formatStorePhoneIndia, mobileDigitsSql, storePhoneLast10 } from "../utils/phone";
import { kolkataDateTimeNow } from "../utils/kolkata-time";
import { type RowDataPacket } from "mysql2/promise";

type ServiceResult = { httpStatus: number; body: Record<string, unknown> };
type ExistingMobileRow = RowDataPacket & { id: number; name: string | null };

/** RM store update for production `stores/*` schema (RM_SCHEMA_V2=true). */
export async function storeUpdateV2Service(data: Record<string, unknown>): Promise<ServiceResult> {
  normalizeStoreInput(data);

  if (!s(data.mobile)) {
    return {
      httpStatus: 400,
      body: { success: false, message: "Mobile number is required for update" },
    };
  }

  const mobile = formatStorePhoneIndia(s(data.mobile));
  if (!mobile) {
    return {
      httpStatus: 400,
      body: { success: false, message: "Invalid mobile number. Must be a valid 10-digit India mobile." },
    };
  }
  data.mobile = mobile;

  if (!s(data.rm_id)) {
    return { httpStatus: 400, body: { success: false, message: "rm_id is required and cannot be empty" } };
  }

  const last10 = storePhoneLast10(mobile);
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

  if (!existing?.length) {
    return {
      httpStatus: 404,
      body: {
        success: false,
        message:
          "Store not found with the provided mobile number. Use store onboarding for new store registration.",
      },
    };
  }

  const storeId = Number(existing[0].id);
  const ctx = await buildStorePayloadContext(data);
  const planDetails = await resolveOnboardingPlan(ctx.plan_id);
  const subscriptionPlanId = planDetails?.id !== undefined && planDetails.id !== null ? Number(planDetails.id) : null;

  const business_name = s(data.business_name);
  const email = s(data.email);
  const business_type = s(data.business_type);
  const tagline = data.slogan !== undefined ? s(data.slogan) : ctx.storeMasterDefaults.slogan;
  const shortDescription = data.tags !== undefined ? s(data.tags) : ctx.storeMasterDefaults.sdesc;
  const description = data.description !== undefined ? s(data.description) : ctx.storeMasterDefaults.cdesc;
  const cancelPolicy =
    data.cancel_policy !== undefined ? s(data.cancel_policy) : ctx.storeMasterDefaults.cancle_policy;
  const logoUrl = s(data.store_banner) ? s(data.store_banner) : undefined;
  const bannerUrl = s(data.cover_image_url) ? s(data.cover_image_url) : undefined;
  const baseDistance = data.base_distance !== undefined ? toFloat(data.base_distance, 5) : 5;
  const baseCharge = data.base_charge !== undefined ? toFloat(data.base_charge, 0) : 0;
  const extraCharge = data.extra_charge !== undefined ? toFloat(data.extra_charge, 0) : 0;
  const { breakStart, breakEnd } = parseStoreBreakTimes(data);
  const city = data.city !== undefined && s(data.city) !== "" ? s(data.city) : "Unknown";
  const state = data.state !== undefined && s(data.state) !== "" ? s(data.state) : "Unknown";
  const latitude = data.latitude !== undefined ? toFloat(data.latitude, 0) : 0;
  const longitude = data.longitude !== undefined ? toFloat(data.longitude, 0) : 0;
  const nowKolkata = kolkataDateTimeNow();

  try {
    await pool.query(
      `
      UPDATE stores SET
        name = :name,
        owner_name = :owner_name,
        tagline = :tagline,
        short_description = :short_description,
        description = :description,
        logo_url = COALESCE(:logo_url, logo_url),
        banner_url = COALESCE(:banner_url, banner_url),
        location_code = :location_code,
        category_ids = :category_ids,
        zone_id = :zone_id,
        referral_code = :referral_code,
        regional_aggregator_id = :ra_id,
        franchisee_id = :fr_id,
        regional_manager_id = :rm_id,
        subscription_plan_id = :subscription_plan_id,
        years_in_business = :years_in_business,
        cancellation_policy = :cancellation_policy,
        updated_at = :now_kolkata
      WHERE id = :store_id
      `,
      {
        store_id: storeId,
        now_kolkata: nowKolkata,
        name: business_name,
        owner_name: data.owner_name !== undefined ? s(data.owner_name) : "",
        tagline,
        short_description: shortDescription,
        description,
        logo_url: logoUrl ?? null,
        banner_url: bannerUrl ?? null,
        location_code: business_type,
        category_ids: ctx.categoryIds,
        zone_id: ctx.zoneId,
        referral_code: data.refercode !== undefined ? s(data.refercode) : "",
        ra_id: ctx.ra_id,
        fr_id: ctx.fr_id,
        rm_id: ctx.rm_id,
        subscription_plan_id: Number.isFinite(subscriptionPlanId) ? subscriptionPlanId : null,
        years_in_business:
          data.years_in_business !== undefined ? String(toInt(data.years_in_business, 0)) : "0",
        cancellation_policy: cancelPolicy,
      } as any,
    );

    await pool.query(
      `
      UPDATE store_credentials SET
        email = :email,
        phone_number = :phone_number,
        password_hash = CASE WHEN :password <> '' THEN :password ELSE password_hash END,
        access_token = COALESCE(:access_token, access_token),
        updated_at = :now_kolkata
      WHERE store_id = :store_id
      `,
      {
        store_id: storeId,
        now_kolkata: nowKolkata,
        email: email || null,
        phone_number: mobile,
        password: s(data.password),
        access_token: data.token !== undefined ? s(data.token) : null,
      } as any,
    );

    await pool.query(
      `
      UPDATE store_addresses SET
        address_line_1 = :address_line_1,
        street = :street,
        area = :area,
        city = :city,
        state = :state,
        postal_code = :postal_code,
        landmark = :landmark,
        latitude = :latitude,
        longitude = :longitude,
        updated_at = :now_kolkata
      WHERE store_id = :store_id AND is_default = 1
        AND (is_deleted = 0 OR is_deleted IS NULL)
      `,
      {
        store_id: storeId,
        now_kolkata: nowKolkata,
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

    await pool.query(
      `
      UPDATE store_operating_hours SET
        opening_time = :opening_time,
        closing_time = :closing_time,
        break_start_time = :break_start_time,
        break_end_time = :break_end_time,
        updated_at = :now_kolkata
      WHERE store_id = :store_id
      `,
      {
        store_id: storeId,
        now_kolkata: nowKolkata,
        opening_time: ctx.opentime,
        closing_time: ctx.closetime,
        break_start_time: breakStart,
        break_end_time: breakEnd,
      } as any,
    );

    await pool.query(
      `
      UPDATE store_pricing_settings SET
        platform_commission_rate = :platform_commission_rate,
        price_per_km = :price_per_km,
        base_price = :base_price,
        additional_price = :additional_price,
        cancellation_policy = :cancellation_policy,
        updated_at = :now_kolkata
      WHERE store_id = :store_id
        AND (is_deleted = 0 OR is_deleted IS NULL)
      `,
      {
        store_id: storeId,
        now_kolkata: nowKolkata,
        platform_commission_rate: ctx.commission,
        price_per_km: baseDistance,
        base_price: baseCharge,
        additional_price: extraCharge,
        cancellation_policy: cancelPolicy,
      } as any,
    );

    await pool.query(
      `
      UPDATE store_delivery_settings SET
        delivery_radius_km = :delivery_radius_km,
        updated_at = :now_kolkata
      WHERE store_id = :store_id
        AND (is_deleted = 0 OR is_deleted IS NULL)
      `,
      { store_id: storeId, now_kolkata: nowKolkata, delivery_radius_km: baseDistance } as any,
    );

    const image_files = buildStoreImageFiles(
      data,
      logoUrl ?? data.store_banner,
      bannerUrl ?? data.cover_image_url,
    );

    return {
      httpStatus: 200,
      body: {
        success: true,
        message: "Store updated successfully",
        action: "updated",
        store_id: storeId,
        store_name: business_name,
        email,
        image_files,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { httpStatus: 500, body: { success: false, message: `Database error: ${msg}` } };
  }
}
