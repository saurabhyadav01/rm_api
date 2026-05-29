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
