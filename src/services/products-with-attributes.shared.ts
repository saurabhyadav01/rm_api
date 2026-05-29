import fs from "fs/promises";
import path from "path";
import { resolveStorageAbsoluteDir } from "../config/uploads";

export function s(v: unknown) {
  return String(v ?? "").trim();
}

export function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function saveImageFromUrl(url: string, outDir: string, allowedExt: string[]) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const buf = Buffer.from(await resp.arrayBuffer());
  const extFromUrl = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
  const ext = extFromUrl && allowedExt.includes(extFromUrl) ? extFromUrl : "jpg";
  const fileName = `${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`;
  const relPath = path.posix.join(outDir.replaceAll("\\", "/"), fileName);
  const absPath = path.join(resolveStorageAbsoluteDir(outDir), fileName);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
  return { relPath, absPath };
}

async function saveImageFromDataUri(dataUri: string, outDir: string) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.*)$/i.exec(dataUri);
  if (!m) return null;
  const ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  const b64 = m[2].replace(/ /g, "+");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) return null;
  const fileName = `${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`;
  const relPath = path.posix.join(outDir.replaceAll("\\", "/"), fileName);
  const absPath = path.join(resolveStorageAbsoluteDir(outDir), fileName);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
  return { relPath, absPath };
}

export function resolveStoredImageAbsPath(relPath: string): string {
  const normalized = String(relPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (path.isAbsolute(relPath)) return relPath;
  if (normalized.startsWith("images/")) {
    return path.join(resolveStorageAbsoluteDir(normalized));
  }
  return path.join(process.cwd(), normalized);
}

export async function resolveAndSaveImage(input: string, outDir: string) {
  const allowedExt = ["png", "jpg", "jpeg", "webp"];
  if (isHttpUrl(input)) return saveImageFromUrl(input, outDir, allowedExt);
  if (input.includes("data:image")) return saveImageFromDataUri(input, outDir);
  return null;
}

export function sanitizeUtf8LikePhp(v: string) {
  let t = v.replace(/[\u{10000}-\u{10FFFF}]/gu, "");
  t = t.replace(/[\u2000-\u200F\u2028-\u202F\u205F-\u206F\uFEFF]/gu, " ");
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return t.replace(/\s+/g, " ").trim();
}

export function toAboutProductString(input: unknown) {
  if (Array.isArray(input)) return input.map((x) => s(x)).filter(Boolean).join("\n");
  return s(input);
}

export function toProductInformationString(input: unknown) {
  if (input && typeof input === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (s(k) && s(v)) out.push(`${s(k)}: ${s(v)}`);
    }
    return out.join("\n");
  }
  return s(input);
}

export function parseAttributePricing(attr: Record<string, unknown>) {
  const mprice = s(attr.mprice) || "0";
  const sprice = s(attr.sprice) || "0";
  const srequire = s(attr.srequire) || "0";
  const mtype = s(attr.title) || s(attr.mtype) || "Default";
  const mdiscount = s(attr.mdiscount) || "0";
  const status = attr.status !== undefined && attr.status !== null && s(attr.status) !== "" ? s(attr.status) : "1";

  const normal = Number(mprice) || 0;
  const flat_discount = Number(mdiscount) || 0;
  let discounted_price = Math.round(normal - flat_discount);
  if (discounted_price <= 0 && normal > 0) discounted_price = 1;

  const isOutOfStock = s(attr.mstock) === "0" ? 1 : 0;

  return {
    mprice,
    sprice,
    srequire,
    mtype,
    mdiscount,
    status,
    normal,
    flat_discount,
    discounted_price,
    isOutOfStock,
    out_of_stock: isOutOfStock,
  } as const;
}

export async function resolveAttrImage(attr: Record<string, unknown>, productImagePath: string) {
  const attrImageInput = s(attr.attr_image) || s(attr.image) || "";
  if (!attrImageInput) return productImagePath;
  if (isHttpUrl(attrImageInput) || attrImageInput.includes("data:image")) {
    const saved = await resolveAndSaveImage(attrImageInput, "images/product_attribute");
    return saved?.relPath ?? productImagePath;
  }
  return attrImageInput;
}

export function collectAttributesInput(data: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(data.attributes) && data.attributes.length) {
    return data.attributes as Record<string, unknown>[];
  }
  return [
    {
      mprice: data.mprice ?? "0",
      sprice: data.sprice ?? "0",
      title: data.mtype ?? data.attr_title ?? "Default",
      mdiscount: data.mdiscount ?? "0",
      mstock: data.mstock ?? "1",
      srequire: data.srequire ?? "0",
      attribute_id: data.attribute_id,
    },
  ];
}
