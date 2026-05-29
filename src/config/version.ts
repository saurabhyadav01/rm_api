import { readFileSync } from "fs";
import path from "path";

/** Default API version when `API_VERSION` is not set */
export const DEFAULT_API_VERSION = "v1";

/** URL segment, e.g. `v1` → routes mounted at `/api/v1` */
export function getApiVersion(): string {
  const raw = process.env.API_VERSION?.trim();
  if (!raw) return DEFAULT_API_VERSION;
  return raw.replace(/^\//, "");
}
export function getApiVersionPath(): string {
  const version = getApiVersion();
  return version ? `/${version}` : "";
}

/** App/package semver from package.json */
export function getPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return process.env.npm_package_version ?? "0.0.0";
  }
}

export function getVersionInfo() {
  return {
    apiVersion: getApiVersion(),
    packageVersion: getPackageVersion(),
    service: "rm-backend",
  };
}
