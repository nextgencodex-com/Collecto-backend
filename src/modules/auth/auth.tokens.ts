import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import type { AuthRole } from "../../types/express.js";

export interface AccessClaims {
  sub: string;
  role: AuthRole;
}

export function signAccessToken(userId: number, role: AuthRole) {
  const token = jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
  const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
  return { token, expiresIn: exp - iat };
}

/** Throws jwt.JsonWebTokenError / TokenExpiredError on any problem. */
export function verifyAccessToken(token: string): AccessClaims {
  const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
  if (
    typeof p === "string" ||
    typeof p.sub !== "string" ||
    (p.role !== "OWNER" && p.role !== "RIDER")
  )
    throw new jwt.JsonWebTokenError("invalid claims");
  return { sub: p.sub, role: p.role };
}

/** Opaque random refresh token. Only its SHA-256 hash is stored. */
export const newRefreshToken = () => randomBytes(48).toString("base64url");
export const hashRefreshToken = (t: string) => createHash("sha256").update(t).digest("hex");
