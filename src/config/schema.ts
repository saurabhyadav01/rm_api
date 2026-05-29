/**
 * Product/store DB layout aligned with hellochotu_microservices.
 * Default: v2 tables (`products`, `product_variants`, `service_details`, …).
 * Set RM_SCHEMA_V2=false only for legacy `tbl_*` databases.
 */
export function useProductSchemaV2(): boolean {
  const raw = String(process.env.RM_SCHEMA_V2 ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}
