import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, try again later", errors: [] },
};

export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300 });

export const createLoginLimiter = (limit = 10, skip?: () => boolean) =>
  rateLimit({ ...base, windowMs: 15 * 60_000, limit, skip });

/**
 * 10 attempts per 15 minutes per IP. Skipped under test so suites can log in freely, unless a test
 * sets ENABLE_LOGIN_LIMITER=1 to exercise the real limiter.
 */
export const loginLimiter = createLoginLimiter(
  10,
  () => env.NODE_ENV === "test" && process.env.ENABLE_LOGIN_LIMITER !== "1",
);
