import { pool } from "../db/mysql";
import { type RowDataPacket } from "mysql2/promise";

type PlanRow = RowDataPacket & {
  id: number;
  plan_title: string | null;
  price: string | number | null;
  product_limit?: number | null;
};

export type PlanDetails = {
  id: number | string;
  plan_title: string;
  price: number;
  product_limit?: number;
};

function toPlanDetails(row: PlanRow): PlanDetails {
  return {
    id: row.id,
    plan_title: row.plan_title ? String(row.plan_title) : "",
    price: Number(row.price ?? 0),
    product_limit: row.product_limit !== undefined && row.product_limit !== null ? Number(row.product_limit) : undefined,
  };
}

/** Mirrors PHP PlanHelper::getPlanDetails — numeric id or slug (trial, premium). */
export async function getPlanDetails(planId: string | number): Promise<PlanDetails | null> {
  const key = String(planId ?? "").trim();
  if (!key) return null;

  if (/^\d+$/.test(key)) {
    const [rows] = await pool.query<PlanRow[]>(
      "SELECT id, plan_title, price, product_limit FROM tbl_joining_plan WHERE id = :id LIMIT 1",
      { id: Number(key) } as any,
    );
    if (rows?.[0]) return toPlanDetails(rows[0]);
  }

  const slug = key.toLowerCase();
  const [slugRows] = await pool.query<PlanRow[]>(
    `
    SELECT id, plan_title, price, product_limit
    FROM tbl_joining_plan
    WHERE LOWER(plan_title) = :slug
    LIMIT 1
    `,
    { slug } as any,
  );

  if (slugRows?.[0]) return toPlanDetails(slugRows[0]);

  // PHP fallbacks for legacy numeric plan ids
  if (key === "1100") return getPlanDetails("premium");
  if (key === "21") return getPlanDetails("trial");

  return null;
}

export async function resolveOnboardingPlan(planId: string): Promise<PlanDetails> {
  const found = await getPlanDetails(planId);
  if (found) return found;
  const trial = await getPlanDetails("trial");
  if (trial) return trial;
  return { id: planId, plan_title: "trial", price: 0 };
}
