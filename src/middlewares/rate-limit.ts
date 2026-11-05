import rateLimit from "express-rate-limit";

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, try again later", errors: [] },
};

export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300 });
/** Applied to /auth/login in Phase 3. */
export const loginLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 10 });
