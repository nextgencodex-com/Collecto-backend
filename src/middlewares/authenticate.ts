import type { RequestHandler } from "express";
import { findUserById } from "../modules/auth/auth.repository.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { HttpError } from "../utils/http.js";

/**
 * Requires `Authorization: Bearer <access token>`. The user is re-read on every request so that
 * deactivating a rider takes effect immediately, not when their access token expires.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Authentication required");

  let claims;
  try {
    claims = verifyAccessToken(header.slice(7));
  } catch (e) {
    const expired = e instanceof Error && e.name === "TokenExpiredError";
    throw new HttpError(401, expired ? "Session expired" : "Invalid token", [
      { code: expired ? "token_expired" : "token_invalid" },
    ]);
  }

  const user = await findUserById(Number(claims.sub));
  if (!user || !user.active || user.role !== claims.role)
    throw new HttpError(401, "Session expired", [{ code: "token_invalid" }]);

  req.user = { id: user.id, role: user.role, username: user.username, name: user.name };
  next();
};
