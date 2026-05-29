import { pool } from "../db/mysql";
import { type ResultSetHeader } from "mysql2/promise";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function optionalString(data: Record<string, unknown>, key: string): string | null {
  if (!(key in data)) return null;
  const val = s(data[key]);
  return val !== "" ? val : null;
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

/** Mirrors PHP: SRID in store_id → Non-onboarded, else Onboarded. */
function resolveStoreType(storeId: string): "Onboarded" | "Non-onboarded" {
  return storeId.toUpperCase().includes("SRID") ? "Non-onboarded" : "Onboarded";
}

export async function rmCheckoutCreateService(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!("rm_id" in data) || s(data.rm_id) === "") {
    return { ResponseCode: "401", Result: "false", ResponseMsg: "rm_id is required" };
  }
  if (!("store_id" in data) || s(data.store_id) === "") {
    return { ResponseCode: "401", Result: "false", ResponseMsg: "store_id is required" };
  }

  const rm_id = s(data.rm_id);
  const store_id = s(data.store_id);
  const store_type = s(data.store_type) !== "" ? s(data.store_type) : resolveStoreType(store_id);
  const checkout_type = s(data.checkout_type) !== "" ? s(data.checkout_type) : "manual";

  const { current_date, current_time, current_date_time } = nowParts();

  let checkin_date_time = current_date_time;
  let checkin_date = current_date;
  let checkin_time = current_time;

  if (s(data.checkin_date_time) !== "") {
    checkin_date_time = s(data.checkin_date_time);
    const checkin_parts = checkin_date_time.split(" ");
    checkin_date = checkin_parts[0] ?? current_date;
    checkin_time = checkin_parts[1] ?? current_time;
  } else if ("checkin_date" in data || "checkin_time" in data) {
    checkin_date = s(data.checkin_date) !== "" ? s(data.checkin_date) : current_date;
    checkin_time = s(data.checkin_time) !== "" ? s(data.checkin_time) : current_time;
    checkin_date_time = `${checkin_date} ${checkin_time}`;
  }

  let checkout_date_time: string | null = null;
  let checkout_date: string | null = null;
  let checkout_time: string | null = null;

  if (s(data.checkout_date_time) !== "") {
    checkout_date_time = s(data.checkout_date_time);
    const checkout_parts = checkout_date_time.split(" ");
    checkout_date = checkout_parts[0] ?? null;
    checkout_time = checkout_parts[1] ?? null;
  } else if ("checkout_date" in data || "checkout_time" in data) {
    checkout_date = s(data.checkout_date) !== "" ? s(data.checkout_date) : current_date;
    checkout_time = s(data.checkout_time) !== "" ? s(data.checkout_time) : current_time;
    checkout_date_time = `${checkout_date} ${checkout_time}`;
  }

  const status = s(data.status) !== "" ? s(data.status) : "1";

  const checkin_latitude = optionalString(data, "checkin_latitude");
  const checkin_longitude = optionalString(data, "checkin_longitude");
  const checkin_location = optionalString(data, "checkin_location");
  const checkout_latitude = optionalString(data, "checkout_latitude");
  const checkout_longitude = optionalString(data, "checkout_longitude");
  const checkout_location = optionalString(data, "checkout_location");

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
      } as any,
    );

    const checkout_id = Number(result.insertId);
    const current_parts = current_date_time.split(" ");

    return {
      ResponseCode: "200",
      Result: "true",
      ResponseMsg: "Checkout record created successfully",
      checkout_id,
      rm_id,
      store_id,
      store_type,
      checkout_type,
      checkin_date_time,
      checkin_date,
      checkin_time,
      checkout_date_time,
      checkout_date,
      checkout_time,
      status,
      current_date_time,
      current_date: current_parts[0],
      current_time: current_parts[1],
      checkin_latitude,
      checkin_longitude,
      checkin_location,
      checkout_latitude,
      checkout_longitude,
      checkout_location,
      created: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ResponseCode: "500",
      Result: "false",
      ResponseMsg: msg ? `Failed to create checkout record: ${msg}` : "Failed to create checkout record",
      rm_id,
      store_id,
    };
  }
}
