import axios from "axios";

const PINCODE_API_BASE = (
  process.env.PINCODE_API_URL || "http://www.postalpincode.in/api/pincode"
).replace(/\/$/, "");

export type PincodeInput = {
  pincode: string;
};

type ServiceResult = {
  httpStatus: number;
  body: Record<string, unknown> | unknown[];
};

function invalidPincodeResponse(): ServiceResult {
  return {
    httpStatus: 200,
    body: {
      Message: "Invalid Pincode",
      Status: "Error",
      PostOffice: [],
    },
  };
}

export async function pincodeLookupService(input: PincodeInput): Promise<ServiceResult> {
  const pincode = String(input.pincode ?? "").trim();

  if (!pincode || !/^[0-9]{6}$/.test(pincode)) {
    return invalidPincodeResponse();
  }

  try {
    const response = await axios.get(`${PINCODE_API_BASE}/${pincode}`, {
      timeout: Number(process.env.PINCODE_API_TIMEOUT_MS || 15000),
      validateStatus: () => true,
    });

    const data = response.data;
    if (data && typeof data === "object") {
      return { httpStatus: 200, body: data as Record<string, unknown> };
    }

    return invalidPincodeResponse();
  } catch {
    return {
      httpStatus: 200,
      body: {
        Message: "Unable to fetch pincode details",
        Status: "Error",
        PostOffice: [],
      },
    };
  }
}
