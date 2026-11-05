import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";

/**
 * CSRF guard for the cookie-based endpoints (refresh, logout): if the browser sent an Origin,
 * it must be one of CORS_ORIGINS. Non-browser clients send no Origin and are unaffected.
 */
export const trustedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (origin && !env.CORS_ORIGINS.includes(origin)) throw new HttpError(403, "Origin not allowed");
  next();
};
