import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { getApiVersionPath } from "./config/version";
import { parseCorsOrigins } from "./config/public-url";
import { router } from "./routes";

dotenv.config();

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: parseCorsOrigins(),
      credentials: false,
    }),
  );
  // Capture raw JSON body so some endpoints can mimic PHP behavior precisely.
  app.use(
    express.json({
      limit: "1mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf?.toString("utf8") ?? "";
      },
    }),
  );
  app.use(morgan("dev"));

  const versionPath = getApiVersionPath();
  app.get("/", (_req, res) => res.redirect(`/api${versionPath}/health`));
  app.use(`/api${versionPath}`, router);
  // Backward-compatible unversioned mount (existing clients / production health URL)
  if (versionPath) {
    app.use("/api", router);
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Match legacy PHP behavior: invalid JSON body becomes "empty data",
    // which then triggers rm_id required error response for these endpoints.
    const isJsonParseError =
      typeof err === "object" &&
      err !== null &&
      "type" in err &&
      (err as any).type === "entity.parse.failed";

    const rmListSuffixes = [
      "/stores/list",
      "/non_onboarded_store/list",
      "/stores/search",
      "/non_onboarded_store/search",
    ];
    if (isJsonParseError && rmListSuffixes.some((suffix) => req.path.endsWith(suffix))) {
      return res.status(400).json({
        success: false,
        ResponseCode: "401",
        Result: "false",
        ResponseMsg: "RM ID is required",
      });
    }

    if (isJsonParseError && req.path.endsWith("/categories/by-type")) {
      return res.status(400).json({
        ResponseCode: "401",
        Result: "false",
        ResponseMsg: "Invalid JSON data",
      });
    }

    // eslint-disable-next-line no-console
    console.error("[rm] unhandled error", err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}

