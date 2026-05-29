import fs from "fs/promises";
import path from "path";

function isProbablyUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extFromUrl(url: string) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).replace(".", "");
    return ext || "jpg";
  } catch {
    return "jpg";
  }
}

export async function downloadBannerIfUrl(banner: string): Promise<string> {
  if (!banner) return "";
  if (!isProbablyUrl(banner)) return banner;

  const uploadDir = path.join(process.cwd(), "uploads", "stores", "non_onboarded_store");
  await fs.mkdir(uploadDir, { recursive: true });

  const ext = extFromUrl(banner);
  const fileName = `img_${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  const resp = await fetch(banner);
  if (!resp.ok) {
    throw new Error("Unable to download banner image");
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(filePath, buf);

  // Return relative-ish path (matches PHP returning stored path string)
  return path.join("uploads", "stores", "non_onboarded_store", fileName).replaceAll("\\", "/");
}

