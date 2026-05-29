import { type Request, type Response } from "express";
import { getRoutesWithUrls } from "../config/route-catalog";
import { getApiBaseUrl, getApiPrefix, getHealthUrl, getLegacyApiPrefix, getLegacyHealthUrl } from "../config/public-url";
import { getVersionInfo } from "../config/version";

export function getApiInfo(_req: Request, res: Response) {
  const { apiVersion, packageVersion, service } = getVersionInfo();

  res.json({
    service,
    version: packageVersion,
    apiVersion,
    baseUrl: getApiBaseUrl(),
    api: getApiPrefix(),
    health: getHealthUrl(),
    legacyApi: getLegacyApiPrefix(),
    legacyHealth: getLegacyHealthUrl(),
    routes: getRoutesWithUrls(),
  });
}