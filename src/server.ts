import "./config/load-env";
import { envFileLoadedFrom, warnIfRmJwtMissing } from "./config/load-env";

warnIfRmJwtMissing();

import { createApp } from "./app";
import { getApiBaseUrl } from "./config/public-url";
import { getApiVersion } from "./config/version";

const port = Number(process.env.PORT ?? 4001);
const app = createApp();

app.listen(port, () => {
  const version = getApiVersion();
  const base = getApiBaseUrl();
  const envFrom = envFileLoadedFrom();
  // eslint-disable-next-line no-console
  console.log(`[rm] listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`[rm] API default version: ${version} → ${base}/api/${version}`);
  if (envFrom) {
    // eslint-disable-next-line no-console
    console.log(`[rm] env loaded from ${envFrom}`);
  }
});