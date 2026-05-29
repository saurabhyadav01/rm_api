import fs from "fs";
import path from "path";
import type { RequestHandler } from "express";
import { getLegacyImagesRootDir } from "../config/uploads";

function safeAbsolutePath(root: string, urlPath: string): string | null {
  const rel = String(urlPath ?? "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
  if (!rel || rel.includes("..")) return null;

  const rootResolved = path.resolve(root);
  const abs = path.resolve(rootResolved, rel);
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) return null;
  return abs;
}

/** Linux is case-sensitive; try exact path then same filename with different extension case. */
function resolveExistingFile(absPath: string): string | null {
  if (fs.existsSync(absPath)) return absPath;

  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir);
  const match = entries.find((name) => name.toLowerCase() === base.toLowerCase());
  return match ? path.join(dir, match) : null;
}

/** Serve files from hellochotu_microservices/images (store/, product/, dstore.png, …). */
export function legacyImagesMiddleware(): RequestHandler {
  return (req, res, next) => {
    const abs = safeAbsolutePath(getLegacyImagesRootDir(), req.path);
    if (!abs) {
      res.status(400).json({ error: "Bad Request" });
      return;
    }

    const file = resolveExistingFile(abs);
    if (!file) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    res.sendFile(file, { maxAge: "7d" }, (err) => {
      if (!err) return;
      const code = (err as NodeJS.ErrnoException).code;
      if (!res.headersSent && code === "ENOENT") {
        res.status(404).json({ error: "Not Found" });
        return;
      }
      if (!res.headersSent) next(err);
    });
  };
}
