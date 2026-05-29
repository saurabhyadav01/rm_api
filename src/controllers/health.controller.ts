import { type Request, type Response } from "express";
import { getApiBaseUrl, getApiPrefix, getHealthUrl, getLegacyApiPrefix, getLegacyHealthUrl } from "../config/public-url";
import { getVersionInfo } from "../config/version";

export function getHealth(req: Request, res: Response) {
  const requestBase =
    req.get("x-forwarded-proto") && req.get("host")
      ? `${req.get("x-forwarded-proto")}://${req.get("host")}`
      : undefined;

  const { apiVersion, packageVersion, service } = getVersionInfo();

  res.json({
    ok: true,
    service,
    version: packageVersion,
    apiVersion,
    time: new Date().toISOString(),
    api: getApiPrefix(),
    health: getHealthUrl(),
    legacyApi: getLegacyApiPrefix(),
    legacyHealth: getLegacyHealthUrl(),
    baseUrl: getApiBaseUrl(),
    requestUrl: requestBase ? `${requestBase}${req.path}` : undefined,
  });
}
