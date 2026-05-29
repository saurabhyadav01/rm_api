import { pool } from "../db/mysql";
import { useStoresTable } from "../config/schema";
import {
  buildServiceDetailsFields,
  buildStoreImageFiles,
  buildStorePayloadContext,
  normalizeStoreInput,
  s,
} from "./store-onboarding.shared";
import { type RowDataPacket } from "mysql2/promise";

type ServiceResult = { httpStatus: number; body: Record<string, unknown> };
type ExistingRow = RowDataPacket & { id: number };

export async function storeUpdateService(data: Record<string, unknown>): Promise<ServiceResult> {
  if (useStoresTable()) {
    return {
      httpStatus: 501,
      body: {
        success: false,
        message:
          "Store update on production DB uses stores/* tables. Use HelloChotu panel/store service until RM update is migrated.",
      },
    };
  }

  normalizeStoreInput(data);

  if (!s(data.mobile)) {
    return {
      httpStatus: 400,
      body: { success: false, message: "Mobile number is required for update" },
    };
  }

  const mobile = s(data.mobile);

  const [existing] = await pool.query<ExistingRow[]>(
    "SELECT id FROM service_details WHERE mobile = :mobile LIMIT 1",
    { mobile } as any,
  );
  if (!existing?.length) {
    return {
      httpStatus: 404,
      body: {
        success: false,
        message:
          "Store not found with the provided mobile number. Use store_onboarding.php for new store registration.",
      },
    };
  }

  const existingStoreId = Number(existing[0].id);

  if (!s(data.rm_id)) {
    return {
      httpStatus: 400,
      body: { success: false, message: "rm_id is required and cannot be empty" },
    };
  }

  try {
    const ctx = await buildStorePayloadContext(data);
    const updateData = buildServiceDetailsFields(data, ctx, "update");

    const setClause = Object.keys(updateData)
      .map((col) => `${col} = :${col}`)
      .join(", ");

    await pool.query(`UPDATE service_details SET ${setClause} WHERE id = :id`, {
      ...updateData,
      id: existingStoreId,
    } as any);

    const image_files = buildStoreImageFiles(data, updateData.rimg, updateData.cover_img);

    return {
      httpStatus: 200,
      body: {
        success: true,
        message: "Store updated successfully",
        action: "updated",
        store_id: existingStoreId,
        store_name: s(data.business_name),
        email: s(data.email),
        image_files,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      httpStatus: 500,
      body: { success: false, message: `Database error: ${msg}` },
    };
  }
}
