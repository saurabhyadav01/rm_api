import fs from "fs/promises";
import path from "path";

export type UploadResult =
  | { status: true; message: string; file_name: string; file_path: string }
  | { status: false; message: string };

function toPosix(p: string) {
  return p.replaceAll("\\", "/");
}

export async function saveUploadedFile(opts: {
  originalName: string;
  buffer: Buffer;
  size: number;
  targetDir: string; // relative or absolute
  allowedTypes: string[];
  maxSizeBytes: number;
  fileNameOverride?: string;
}): Promise<UploadResult> {
  if (!opts.originalName) {
    return { status: false, message: "No file uploaded or an error occurred" };
  }

  if (opts.size > opts.maxSizeBytes) {
    return {
      status: false,
      message: `File exceeds the maximum allowed size of ${opts.maxSizeBytes / 1024 / 1024} MB`,
    };
  }

  const fileExt = path.extname(opts.originalName).replace(".", "").toLowerCase();
  if (!opts.allowedTypes.includes(fileExt)) {
    return {
      status: false,
      message: `Invalid file type. Allowed types are: ${opts.allowedTypes.join(", ")}`,
    };
  }

  const dirAbs = path.isAbsolute(opts.targetDir) ? opts.targetDir : path.join(process.cwd(), opts.targetDir);
  await fs.mkdir(dirAbs, { recursive: true });

  const fileName = opts.fileNameOverride ?? `img_${Date.now()}_${Math.floor(Math.random() * 1e9)}.${fileExt}`;
  const destinationAbs = path.join(dirAbs, fileName);
  await fs.writeFile(destinationAbs, opts.buffer);

  const destinationRel = path.isAbsolute(opts.targetDir)
    ? destinationAbs
    : path.join(opts.targetDir, fileName);

  return {
    status: true,
    message: "Image uploaded successfully",
    file_name: fileName,
    file_path: toPosix(destinationRel),
  };
}

