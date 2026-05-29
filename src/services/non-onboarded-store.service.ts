import { pool } from "../db/mysql";
import { downloadBannerIfUrl } from "../utils/banner";
import { type ResultSetHeader } from "mysql2/promise";

type Input = {
  store_id?: string;

  rm_id?: string;
  shop_name?: string;
  owner_name?: string;
  phone_no?: string;
  category?: string;

  latitude?: string | number;
  longitude?: string | number;
  current_location?: string;

  address_line?: string;
  city?: string;
  area?: string;
  district?: string;
  state?: string;
  pincode?: string;

  email?: string;
  banner?: string;

  non_onboarding_reason?: string;
  expected_onboarding_value?: string | number | null;
  expected_onboarding_unit?: string;
};

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

function trim(v: unknown): string {
  return String(v ?? "").trim();
}

function isRequiredMissing(input: Input) {
  const store_id = trim(input.store_id);

  const rm_id = trim(input.rm_id);
  const shop_name = trim(input.shop_name);
  const owner_name = trim(input.owner_name);
  const phone_no = trim(input.phone_no);
  const category = trim(input.category);

  const latitude = trim(input.latitude);
  const longitude = trim(input.longitude);
  const current_location = trim(input.current_location);

  const address_line = trim(input.address_line);
  const city = trim(input.city);
  const district = trim(input.district);
  const state = trim(input.state);
  const pincode = trim(input.pincode);

  // For update, store_id is required but the PHP code still requires all fields too.
  // So we keep the same "required fields missing" logic regardless of create/update.
  void store_id;

  return (
    rm_id === "" ||
    shop_name === "" ||
    owner_name === "" ||
    phone_no === "" ||
    category === "" ||
    latitude === "" ||
    longitude === "" ||
    current_location === "" ||
    address_line === "" ||
    city === "" ||
    district === "" ||
    state === "" ||
    pincode === ""
  );
}

function isValidPhone(phone: string) {
  return /^[6-9][0-9]{9}$/.test(phone);
}

export async function upsertNonOnboardedStoreService(input: Input): Promise<ServiceResult> {
  const store_id = trim(input.store_id); // OPTIONAL (for update)

  const rm_id = trim(input.rm_id);
  const shop_name = trim(input.shop_name);
  const owner_name = trim(input.owner_name);
  const phone_no = trim(input.phone_no);
  const category = trim(input.category);

  const latitude = trim(input.latitude);
  const longitude = trim(input.longitude);
  const current_location = trim(input.current_location);

  const address_line = trim(input.address_line);
  const city = trim(input.city);
  const area = trim(input.area);
  const district = trim(input.district);
  const state = trim(input.state);
  const pincode = trim(input.pincode);

  const email = trim(input.email);
  const banner = trim(input.banner);

  const non_onboarding_reason = trim(input.non_onboarding_reason);
  const expected_onboarding_value_raw = input.expected_onboarding_value;
  const expected_onboarding_unit_raw = trim(input.expected_onboarding_unit);

  if (isRequiredMissing(input)) {
    return {
      httpStatus: 200,
      body: {
        ResponseCode: "400",
        Result: "false",
        message: "Required fields missing",
      },
    };
  }

  if (!isValidPhone(phone_no)) {
    return {
      httpStatus: 200,
      body: {
        ResponseCode: "400",
        Result: "false",
        message: "Invalid phone number",
      },
    };
  }

  let expected_onboarding_unit: "day" | "week" | "month" | null = null;
  if (expected_onboarding_unit_raw !== "") {
    const u = expected_onboarding_unit_raw.toLowerCase();
    if (u !== "day" && u !== "week" && u !== "month") {
      return {
        httpStatus: 200,
        body: {
          ResponseCode: "400",
          Result: "false",
          message: "expected_onboarding_unit must be one of: day, week, month",
        },
      };
    }
    expected_onboarding_unit = u;
  }

  const expected_onboarding_value =
    expected_onboarding_value_raw === null || expected_onboarding_value_raw === undefined || expected_onboarding_value_raw === ""
      ? null
      : Number(expected_onboarding_value_raw);

  const shop_banner = await downloadBannerIfUrl(banner);

  const emailOrNull = email === "" ? null : email;
  const reasonOrNull = non_onboarding_reason === "" ? null : non_onboarding_reason;

  try {
    if (store_id === "") {
      // -------- CREATE --------
      const [result] = await pool.query<ResultSetHeader>(
        `
        INSERT INTO non_onboarded_store
        (
          rm_id, shop_name, owner_name, phone_no,
          latitude, longitude, current_location,
          address_line, city, area, district, state, pincode,
          category, email, shop_banner,
          non_onboarding_reason, expected_onboarding_value, expected_onboarding_unit,
          is_active, is_deleted
        )
        VALUES
        (
          :rm_id, :shop_name, :owner_name, :phone_no,
          :latitude, :longitude, :current_location,
          :address_line, :city, :area, :district, :state, :pincode,
          :category, :email, :shop_banner,
          :non_onboarding_reason, :expected_onboarding_value, :expected_onboarding_unit,
          1, 0
        )
        `,
        {
          rm_id,
          shop_name,
          owner_name,
          phone_no,
          latitude,
          longitude,
          current_location,
          address_line,
          city,
          area: area === "" ? null : area,
          district,
          state,
          pincode,
          category,
          email: emailOrNull,
          shop_banner: shop_banner === "" ? null : shop_banner,
          non_onboarding_reason: reasonOrNull,
          expected_onboarding_value,
          expected_onboarding_unit,
        },
      );

      const lastId = Number(result.insertId);
      const generatedStoreId = `SRID${lastId}`;

      await pool.query(
        `
        UPDATE non_onboarded_store
        SET store_id = :store_id
        WHERE id = :id
        `,
        { store_id: generatedStoreId, id: lastId },
      );

      return {
        httpStatus: 200,
        body: {
          ResponseCode: "200",
          Result: "true",
          message: "Shop created successfully",
          store_id: generatedStoreId,
        },
      };
    }

    // -------- UPDATE --------
    await pool.query(
      `
      UPDATE non_onboarded_store SET
        rm_id=:rm_id,
        shop_name=:shop_name,
        owner_name=:owner_name,
        phone_no=:phone_no,
        latitude=:latitude,
        longitude=:longitude,
        current_location=:current_location,
        address_line=:address_line,
        city=:city,
        area=:area,
        district=:district,
        state=:state,
        pincode=:pincode,
        category=:category,
        email=:email,
        shop_banner=:shop_banner,
        non_onboarding_reason=:non_onboarding_reason,
        expected_onboarding_value=:expected_onboarding_value,
        expected_onboarding_unit=:expected_onboarding_unit
      WHERE id=:id AND is_deleted=0
      `,
      {
        id: store_id, // matches the provided PHP behavior (uses id=store_id)
        rm_id,
        shop_name,
        owner_name,
        phone_no,
        latitude,
        longitude,
        current_location,
        address_line,
        city,
        area: area === "" ? null : area,
        district,
        state,
        pincode,
        category,
        email: emailOrNull,
        shop_banner: shop_banner === "" ? null : shop_banner,
        non_onboarding_reason: reasonOrNull,
        expected_onboarding_value,
        expected_onboarding_unit,
      },
    );

    return {
      httpStatus: 200,
      body: {
        ResponseCode: "200",
        Result: "true",
        message: "Shop updated successfully",
      },
    };
  } catch (e) {
    const err = e as { code?: string; errno?: number; message?: string };

    // MySQL duplicate key: ER_DUP_ENTRY (errno 1062)
    if (err.errno === 1062 || err.code === "ER_DUP_ENTRY") {
      return {
        httpStatus: 200,
        body: {
          ResponseCode: "409",
          Result: "false",
          message: "Mobile number already exists",
        },
      };
    }

    return {
      httpStatus: 200,
      body: {
        ResponseCode: "500",
        Result: "false",
        message: "Network  error",
        error: err.message ?? "Unknown error",
      },
    };
  }
}

