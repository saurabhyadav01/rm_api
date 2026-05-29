import { getApiVersionPath } from "./version";

/** Public API origin without trailing slash, e.g. https://rmapi.hellochotu.com */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.API_BASE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "https://rmapi.hellochotu.com";
}

/** Versioned API prefix, e.g. https://rmapi.hellochotu.com/api/v1 */
export function getApiPrefix(): string {
  return `${getApiBaseUrl()}/api${getApiVersionPath()}`;
}

/** Legacy unversioned prefix — https://rmapi.hellochotu.com/api */
export function getLegacyApiPrefix(): string {
  return `${getApiBaseUrl()}/api`;
}

export function getHealthUrl(): string {
  return `${getApiPrefix()}/health`;
}

export function getLegacyHealthUrl(): string {
  return `${getLegacyApiPrefix()}/health`;
}
export function parseCorsOrigins(): string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === "*") return "*";
  const origins = raw.split(",").map((o) => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0]! : origins;
}
