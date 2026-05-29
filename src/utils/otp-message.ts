const DEFAULT_TEMPLATE =
  "Your Hello Chotu OTP is {otp}. It is valid for 5 minutes. Please keep it confidential and do not share it with anyone. {name} CULTNEST PRIVATE LIMITED";

const TEMPLATES: Record<string, string> = {
  en: DEFAULT_TEMPLATE,
  hi: `नमस्ते {name}, आपका Hello Chotu OTP {otp} है। यह 5 मिनट के लिए वैध है। कृपया इसे गोपनीय रखें और किसी के साथ साझा न करें। CULTNEST PRIVATE LIMITED`,
};

export function getOtpMessage(lang: string, otp: string): string {
  const hashKey = process.env.CUSTOMER_HASH_KEY || process.env.CUSTMER_HASH_KEY || "";
  const template = TEMPLATES[lang.toLowerCase()] ?? TEMPLATES.en ?? DEFAULT_TEMPLATE;
  return template.replace(/{name}/g, hashKey).replace(/{otp}/g, otp);
}
