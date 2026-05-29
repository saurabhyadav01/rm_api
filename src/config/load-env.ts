import fs from "fs";
import path from "path";
import dotenv from "dotenv";

let loadedFrom: string | null = null;

/**
 * Load `.env` from rm_api root (works when PM2 cwd is not the app folder).
 * Call once at process startup before other modules read process.env.
 */
export function loadEnv(): void {
  if (loadedFrom !== null) return;

  const candidates = [
    process.env.RM_ENV_FILE?.trim(),
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env"),
  ].filter((p): p is string => Boolean(p));

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      loadedFrom = envPath;
      break;
    }
  }

  if (!loadedFrom) {
    dotenv.config();
    loadedFrom = "(default dotenv lookup)";
  }
}

export function envFileLoadedFrom(): string | null {
  return loadedFrom;
}

/** RM login JWT — required in production. */
export function getRmJwtSecret(): string {
  const secret =
    process.env.JWT_SECRET?.trim() ||
    process.env.RM_JWT_SECRET?.trim() ||
    "";
  if (!secret) {
    throw new Error("Missing env JWT_SECRET");
  }
  return secret;
}

export function isRmJwtConfigured(): boolean {
  try {
    getRmJwtSecret();
    return true;
  } catch {
    return false;
  }
}

export function warnIfRmJwtMissing(): void {
  if (isRmJwtConfigured()) return;
  // eslint-disable-next-line no-console
  console.error(
    "[rm] JWT_SECRET is not set — POST /auth/login will fail. Add JWT_SECRET=... to rm_api/.env and restart PM2.",
  );
}

// Run on first import (imports are hoisted above other module side effects).
loadEnv();
