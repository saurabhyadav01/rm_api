import path from "path";
import { getApiBaseUrl, getApiPrefix } from "./public-url";

/** Absolute directory where onboarding uploads are stored (rm_api/uploads/...). */
export function getUploadsRootDir(): string {
  return path.join(process.cwd(), "uploads");
}

/** Absolute directory for legacy product images (rm_api/images/...). */
export function getImagesRootDir(): string {
  return path.join(process.cwd(), "images");
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
    if (rel.startsWith("uploads/")) {
      return `${apiBase}/${rel}`;
    }
    if (rel.startsWith("images/")) {
      return `${apiBase}/${rel}`;
    }
    return `${apiBase}/uploads/${rel}`;
  }

  return `${base}/${rel}`;
}
