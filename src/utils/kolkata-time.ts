/** Asia/Kolkata (+05:30) — matches hellochotu_microservices order/store date handling. */
export const KOLKATA_TZ = "Asia/Kolkata" as const;

type KolkataParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function kolkataParts(d: Date): KolkataParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KOLKATA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

export function formatKolkataDateTime(d: Date): string {
  const p = kolkataParts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function formatKolkataTimeHms(d: Date): string {
  const p = kolkataParts(d);
  return `${p.hour}:${p.minute}:${p.second}`;
}

const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** UTC time-of-day (MySQL TIME / driver Date) → IST (+05:30) `HH:MM:SS` for API responses. */
function utcClockToIstHms(h: number, min: number, sec: number): string {
  const d = new Date(Date.UTC(1970, 0, 1, h, min, sec));
  return formatKolkataTimeHms(d);
}

/**
 * Store hours on list/search only — DB TIME is stored as UTC clock; display IST (+05:30).
 * Onboarding/insert keeps raw `parseTimeToHms` values (no conversion on write).
 */
export function formatMysqlTimeInKolkata(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return utcClockToIstHms(v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds());
  }

  const t = String(v).trim();
  if (!t) return "";
  const m = t.match(TIME_ONLY_RE);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3] ?? 0);
    if (Number.isFinite(h) && Number.isFinite(min) && Number.isFinite(sec)) {
      return utcClockToIstHms(h, min, sec);
    }
  }

  const parsed = Date.parse(t);
  if (Number.isFinite(parsed)) return formatKolkataTimeHms(new Date(parsed));
  return t.length >= 8 ? t.slice(0, 8) : t;
}

/**
 * MySQL DATETIME for `created_at` / transfer date — stored UTC, displayed IST (+05:30).
 */
export function formatMysqlDateTimeInKolkata(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return formatKolkataDateTime(v);

  const t = String(v).trim();
  if (!t) return null;

  const isoLike = t.includes("T") ? t : t.replace(" ", "T");
  const asUtc = /(?:Z|[+-]\d{2}:\d{2})$/i.test(isoLike) ? isoLike : `${isoLike}Z`;
  const d = new Date(asUtc);
  if (Number.isFinite(d.getTime())) return formatKolkataDateTime(d);

  return t;
}

/** SQL fragment: UTC datetime column → IST `YYYY-MM-DD HH:MM:SS` string. */
export function mysqlDatetimeIstSql(column: string): string {
  return `DATE_FORMAT(CONVERT_TZ(${column}, '+00:00', '+05:30'), '%Y-%m-%d %H:%i:%s')`;
}

export const OTP_TTL_SECONDS = 300;

/** OTP expiry metadata for API responses (Asia/Kolkata display). */
export function kolkataOtpExpiryMeta(ttlSeconds = OTP_TTL_SECONDS): {
  expiresAtMs: number;
  expiresInSeconds: number;
  expires_at: string;
} {
  const expiresAtMs = Date.now() + ttlSeconds * 1000;
  return {
    expiresAtMs,
    expiresInSeconds: ttlSeconds,
    expires_at: formatKolkataDateTime(new Date(expiresAtMs)),
  };
}

/** True when a UTC-stored MySQL datetime / Date is past now. */
export function isUtcMysqlDatetimeExpired(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (v instanceof Date) return v.getTime() < Date.now();
  const t = String(v).trim();
  if (!t) return false;
  const isoLike = t.includes("T") ? t : t.replace(" ", "T");
  const asUtc = /(?:Z|[+-]\d{2}:\d{2})$/i.test(isoLike) ? isoLike : `${isoLike}Z`;
  const ms = Date.parse(asUtc);
  return Number.isFinite(ms) && ms < Date.now();
}
