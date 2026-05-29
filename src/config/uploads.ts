import fs from "fs";
import path from "path";
import { getApiBaseUrl, getApiPrefix } from "./public-url";

/** `rm_api` package root (works when PM2 cwd is not the app folder). */
export function getRmApiRootDir(): string {
  return path.resolve(__dirname, "../..");
}

const DEFAULT_LEGACY_IMAGES_DIR = path.resolve(
  getRmApiRootDir(),
  "..",
  "hellochotu_microservices",
  "images",
);

function isRmApiLocalImagesDir(dir: string): boolean {
  const normalized = path.resolve(dir).replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("/rm_api/images") || normalized.includes("/rm_api/images/");
}

/** New RM uploads (onboarding multipart) → `rm_api/uploads/`. */
export function getUploadsRootDir(): string {
  const fromEnv = process.env.RM_UPLOADS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(getRmApiRootDir(), "uploads");
}

/**
 * Legacy HelloChotu images (`images/store`, `images/product`, `images/dstore.png`, …).
 * Default: sibling `hellochotu_microservices/images` (never `rm_api/images`).
 */
export function getLegacyImagesRootDir(): string {
  const fromEnv = process.env.LEGACY_IMAGES_DIR?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (isRmApiLocalImagesDir(resolved)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[rm] LEGACY_IMAGES_DIR=${resolved} is wrong (rm_api/images). Using ${DEFAULT_LEGACY_IMAGES_DIR}`,
      );
      return DEFAULT_LEGACY_IMAGES_DIR;
    }
    return resolved;
  }
  return DEFAULT_LEGACY_IMAGES_DIR;
}

export function warnIfLegacyImagesDirMissing(): void {
  const dir = getLegacyImagesRootDir();
  if (!fs.existsSync(dir)) {
    // eslint-disable-next-line no-console
    console.warn(`[rm] legacy images directory does not exist: ${dir}`);
  }
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
