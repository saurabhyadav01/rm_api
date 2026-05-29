/**
 * Product/store DB layout aligned with hellochotu_microservices.
 * Default: v2 (`stores`, `products`, `product_variants`, …).
 * Set RM_SCHEMA_V2=false only for legacy `service_details` / `tbl_*` databases.
 */
export function useProductSchemaV2(): boolean {
  const raw = String(process.env.RM_SCHEMA_V2 ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

/** Production uses `stores` (not `service_details`). Same flag as product v2. */
export function useStoresTable(): boolean {
  return useProductSchemaV2();
}
