import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler, notFound } from "./middlewares/error-handler.js";
import { apiLimiter } from "./middlewares/rate-limit.js";
import { api } from "./routes.js";
import { uploadsDir } from "./utils/uploads.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/v1/health" } }));
  // Cross-origin resource policy relaxed so the frontend origin can load uploaded images.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  // Uploaded photos have random names and never change, so they can be cached for good.
  app.use(
    "/uploads",
    express.static(uploadsDir(), {
      index: false,
      dotfiles: "deny",
      maxAge: "30d",
      immutable: true,
    }),
  );
  app.use("/api/v1", apiLimiter, api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
