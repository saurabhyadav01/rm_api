import { type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { saveUploadedFile } from "../utils/upload-image";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadBaseDir = "uploads/stores/";
const allowedTypes = ["jpg", "jpeg", "png", "pdf", "doc", "docx", "gif", "webp"];
const maxSize = 10 * 1024 * 1024;

const folderMapping: Record<string, string> = {
  bank_proof_doc: `${uploadBaseDir}bank/`,
  aadhar_doc: `${uploadBaseDir}aadhar/`,
  aadhar_back: `${uploadBaseDir}aadhar_back/`,
  pan_doc: `${uploadBaseDir}pancard/`,
  address_proof_doc: `${uploadBaseDir}proof/`,
  business_reg_doc: `${uploadBaseDir}business/`,
  transaction_receipt: `${uploadBaseDir}receipt/`,
  store_banner: `${uploadBaseDir}`,
  cover_image_url: `${uploadBaseDir}`,
  retailer_signature: `${uploadBaseDir}`,
  attribute_image: "images/product_attribute/",
  loose_product: `${uploadBaseDir}loose_product/`,
  non_onboardstore: `${uploadBaseDir}non_onboarded_store/`,
};

function baseUrl(req: Request) {
  const proto = req.protocol;
  const host = req.get("host") ?? "";
  return `${proto}://${host}/`;
}

export const onboardingImageUploadMiddleware = upload.single("image");

export async function onboardingImageUpload(req: Request, res: Response) {
  // Mirror the PHP behavior
  if (req.method !== "POST") {
    return res.json({
      ResponseCode: "405",
      Result: "false",
      message: "Method not allowed. Use POST request.",
    });
  }

  // image is optional
  const file = req.file;
  if (!file || !file.originalname) {
    return res.json({
      ResponseCode: "200",
      Result: "true",
      message: "No image file uploaded. Image upload is optional.",
      image_uploaded: false,
    });
  }

  const image_type_raw = String((req.body?.image_type ?? "") as string).trim();
  if (!image_type_raw) {
    return res.json({
      ResponseCode: "400",
      Result: "false",
      message: `image_type parameter is required. Supported types: ${Object.keys(folderMapping).join(", ")}`,
    });
  }

  let imageType = image_type_raw;
  if (imageType === "adhar_back") imageType = "aadhar_back";

  let attributeIndex: number | null = null;
  let looseProductIndex: number | null = null;
  let baseImageType = imageType;

  const attrMatch = /^attribute_image(\d+)$/.exec(imageType);
  if (attrMatch) {
    baseImageType = "attribute_image";
    attributeIndex = Number(attrMatch[1]);
  } else {
    const looseMatch = /^loose_product(\d+)$/.exec(imageType);
    if (looseMatch) {
      baseImageType = "loose_product";
      looseProductIndex = Number(looseMatch[1]);
    }
  }

  if (!folderMapping[baseImageType]) {
    return res.json({
      ResponseCode: "400",
      Result: "false",
      message:
        `Invalid image_type. Supported types: ${Object.keys(folderMapping).join(", ")}, ` +
        "attribute_image0, attribute_image1, etc., loose_product0, loose_product1, etc.",
      provided_type: imageType,
    });
  }

  let targetDir = folderMapping[baseImageType];
  if (baseImageType === "attribute_image" && attributeIndex !== null) {
    targetDir = path.posix.join(targetDir.replaceAll("\\", "/"), String(attributeIndex), "/");
  } else if (baseImageType === "loose_product" && looseProductIndex !== null) {
    targetDir = path.posix.join(targetDir.replaceAll("\\", "/"), String(looseProductIndex), "/");
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const fileExt = path.extname(file.originalname).replace(".", "").toLowerCase() || "jpg";
  const isAttributeImage = baseImageType === "attribute_image";

  const fileNameOverride = isAttributeImage
    ? `img_${timestamp}_${String(Math.random()).slice(2)}.${fileExt}`
    : undefined;

  const uploadResult = await saveUploadedFile({
    originalName: file.originalname,
    buffer: file.buffer,
    size: file.size,
    targetDir,
    allowedTypes,
    maxSizeBytes: maxSize,
    fileNameOverride,
  });

  if (!uploadResult.status) {
    return res.json({
      ResponseCode: "400",
      Result: "false",
      message: uploadResult.message,
    });
  }

  const baseUrlClean = baseUrl(req).replace(/\/+$/, "");
  const filePathClean = String(uploadResult.file_path).replace(/^\/+/, "");
  let imageUrl = `${baseUrlClean}/${filePathClean}`;

  // Add timestamp to attribute_image URLs to prevent caching
  if (isAttributeImage) {
    const sep = imageUrl.includes("?") ? "&" : "?";
    imageUrl = `${imageUrl}${sep}t=${timestamp}`;
  }

  const responseData: Record<string, unknown> = {
    ResponseCode: "200",
    Result: "true",
    message: "Image uploaded successfully",
    image_type: imageType,
    image_url: imageUrl,
    image_path: uploadResult.file_path,
    file_name: uploadResult.file_name,
    image_uploaded: true,
  };

  if (isAttributeImage) {
    responseData.timestamp = timestamp;
    if (attributeIndex !== null) responseData.attribute_index = attributeIndex;
  }
  if (baseImageType === "loose_product" && looseProductIndex !== null) {
    responseData.loose_product_index = looseProductIndex;
  }

  return res.json(responseData);
}

