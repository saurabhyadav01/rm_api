/** Strip to digits only; for India mobiles use last 10 digits when length >= 10. */
export function normalizePhoneInput(phone: string): {
  raw: string;
  digits: string;
  last10: string;
} {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return { raw, digits, last10 };
}

/** Last 10 digits of an India mobile (for duplicate checks). */
export function storePhoneLast10(phone: string): string {
  return normalizePhoneInput(phone).last10;
}

/** Store credential mobile — always stored as +91XXXXXXXXXX when valid. */
export function formatStorePhoneIndia(phone: string): string | null {
  const { last10 } = normalizePhoneInput(phone);
  if (last10.length !== 10) return null;
  return `+91${last10}`;
}

/** SQL: last 10 digits from a phone column (MySQL 5.7). */
export function mobileDigitsSql(column: string): string {
  return `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', ''), '_', ''), 10)`;
}
