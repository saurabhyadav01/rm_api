import { pool } from "../db/mysql";
import { type ResultSetHeader } from "mysql2/promise";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function nowParts() {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return {
    current_date: `${y}-${m}-${day}`,
    current_time: `${hh}:${mm}:${ss}`,
    current_date_time: `${y}-${m}-${day} ${hh}:${mm}:${ss}`,
  };
}

export async function rmCheckoutCreateService(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Validate required fields
  if (!("rm_id" in data) || s(data.rm_id) === "") {
    return { ResponseCode: "401", Result: "false", ResponseMsg: "rm_id is required" };
  }
  if (!("store_id" in data) || s(data.store_id) === "") {
    return { ResponseCode: "401", Result: "false", ResponseMsg: "store_id is required" };
  }

  const rm_id = s(data.rm_id);
  const store_id = s(data.store_id);

  const { current_date, current_time, current_date_time } = nowParts();

  // Handle checkin_date and checkin_time separately, or combined checkin_date_time
  let checkin_date_time = current_date_time;
  if (s(data.checkin_date_time) !== "") {
    checkin_date_time = s(data.checkin_date_time);
  } else if ("checkin_date" in data || "checkin_time" in data) {
    const checkin_date = s(data.checkin_date) !== "" ? s(data.checkin_date) : current_date;
    const checkin_time = s(data.checkin_time) !== "" ? s(data.checkin_time) : current_time;
    checkin_date_time = `${checkin_date} ${checkin_time}`;
  }

  // Handle checkout_date and checkout_time separately, or combined checkout_date_time
  let checkout_date_time: string | null = null;
  if (s(data.checkout_date_time) !== "") {
    checkout_date_time = s(data.checkout_date_time);
  } else if ("checkout_date" in data || "checkout_time" in data) {
    const checkout_date = s(data.checkout_date) !== "" ? s(data.checkout_date) : current_date;
    const checkout_time = s(data.checkout_time) !== "" ? s(data.checkout_time) : current_time;
    checkout_date_time = `${checkout_date} ${checkout_time}`;
  }

  // Handle status (optional)
  const status = s(data.status) !== "" ? s(data.status) : "1";

  // NEW FIELD
  const checkout_type = s(data.checkout_type) !== "" ? s(data.checkout_type) : "manual";

  // Optional new fields (based on provided table)
  const checkin_latitude = s((data as any).checkin_latitude) || null;
  const checkin_longitude = s((data as any).checkin_longitude) || null;
  const checkin_location = s((data as any).checkin_location) || null;
  const checkout_latitude = s((data as any).checkout_latitude) || null;
  const checkout_longitude = s((data as any).checkout_longitude) || null;
  const checkout_location = s((data as any).checkout_location) || null;
  const store_type = s((data as any).store_type) || null;

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
      INSERT INTO rm_store_checkout
      (
        rm_id,
        store_id,
        checkin_date_time,
        checkout_date_time,
        checkout_type,
        status,
        current_date_time,
        checkin_latitude,
        checkin_longitude,
        checkin_location,
        checkout_latitude,
        checkout_longitude,
        checkout_location,
        store_type
      )
      VALUES
      (
        :rm_id,
        :store_id,
        :checkin_date_time,
        :checkout_date_time,
        :checkout_type,
        :status,
        :current_date_time,
        :checkin_latitude,
        :checkin_longitude,
        :checkin_location,
        :checkout_latitude,
        :checkout_longitude,
        :checkout_location,
        :store_type
      )
      `,
      {
        rm_id,
        store_id,
        checkin_date_time,
        checkout_date_time,
        checkout_type,
        status,
        current_date_time,
        checkin_latitude,
        checkin_longitude,
        checkin_location,
        checkout_latitude,
        checkout_longitude,
        checkout_location,
        store_type,
      } as any,
    );

    const checkout_id = Number(result.insertId);
    const checkin_parts = checkin_date_time.split(" ");
    const checkout_parts = checkout_date_time ? checkout_date_time.split(" ") : [null, null];
    const current_parts = current_date_time.split(" ");

    return {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Checkout record created successfully",
      checkout_id,
      rm_id,
      store_id,
      checkout_type,
      checkin_date_time,
      checkin_date: checkin_parts[0] ?? "",
      checkin_time: checkin_parts[1] ?? "",
      checkout_date_time,
      checkout_date: checkout_parts[0] ?? null,
      checkout_time: checkout_parts[1] ?? null,
      status,
      current_date_time,
      current_date: current_parts[0],
      current_time: current_parts[1],
      created: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ResponseCode: "500",
      Result: "false",
      ResponseMsg: `Failed to create checkout record: ${msg}`,
      rm_id,
      store_id,
    };
  }
}

