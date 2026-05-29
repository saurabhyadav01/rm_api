import fs from "fs";
import path from "path";
import { getApiBaseUrl, getApiPrefix } from "./public-url";

/** New RM uploads (onboarding multipart) → `rm_api/uploads/`. */
export function getUploadsRootDir(): string {
  const fromEnv = process.env.RM_UPLOADS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), "uploads");
}

/**
 * Legacy HelloChotu images (`images/store`, `images/product`, `images/dstore.png`, …).
 * Default: sibling `hellochotu_microservices/images` (not `rm_api/images`).
 */
export function getLegacyImagesRootDir(): string {
  const fromEnv = process.env.LEGACY_IMAGES_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const candidates = [
    path.join(process.cwd(), "..", "hellochotu_microservices", "images"),
    path.join(process.cwd(), "images"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  return path.resolve(candidates[0]);
}

/** @deprecated Use {@link getLegacyImagesRootDir} */
export function getImagesRootDir(): string {
  return getLegacyImagesRootDir();
}

/** Resolve relative storage path to an absolute directory for writes. */
export function resolveStorageAbsoluteDir(targetDir: string): string {
  const normalized = String(targetDir ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (path.isAbsolute(targetDir)) return targetDir;

  if (normalized.startsWith("uploads/") || normalized === "uploads") {
    const sub = normalized.replace(/^uploads\/?/, "");
    return sub ? path.join(getUploadsRootDir(), sub) : getUploadsRootDir();
  }

  if (normalized.startsWith("images/") || normalized === "images") {
    const sub = normalized.replace(/^images\/?/, "");
    return sub ? path.join(getLegacyImagesRootDir(), sub) : getLegacyImagesRootDir();
  }

  return path.join(process.cwd(), normalized);
}

/**
 * Public URL for a saved file path like `uploads/stores/img.png` or `images/product/x.jpg`.
 * Set `UPLOAD_SERVE_VIA_API=true` when nginx only proxies `/api` to Node (not `/uploads`).
 */
export function getPublicFileUrl(relativePath: string): string {
  const rel = String(relativePath ?? "").replace(/^\/+/, "").replace(/\\/g, "/");
  const base = getApiBaseUrl().replace(/\/+$/, "");

  const viaApi =
    String(process.env.UPLOAD_SERVE_VIA_API ?? "")
      .trim()
      .toLowerCase() === "true";

  if (viaApi) {
    const apiBase = getApiPrefix().replace(/\/+$/, "");
    if (rel.startsWith("uploads/") || rel.startsWith("images/")) {
      return `${apiBase}/${rel}`;
    }
    return `${apiBase}/uploads/${rel}`;
  }

  return `${base}/${rel}`;
}
