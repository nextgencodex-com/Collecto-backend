import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env.js";
import { HttpError, ok } from "../../utils/http.js";
import * as service from "./auth.service.js";
import { REFRESH_RACE } from "./auth.service.js";

const COOKIE = "collecto_rt";
const base: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN,
  path: "/api/v1/auth", // the cookie is only ever sent to the auth endpoints
};

const setRefreshCookie = (res: Response, token: string, persistent: boolean) =>
  res.cookie(COOKIE, token, {
    ...base,
    // "Remember me" -> persistent cookie; otherwise a browser-session cookie
    ...(persistent && { maxAge: env.REFRESH_TTL_DAYS * 86_400_000 }),
  });

const clearRefreshCookie = (res: Response) => res.clearCookie(COOKIE, base);

type Issued = Awaited<ReturnType<typeof service.login>>;
const respond = (res: Response, r: Issued, message: string) => {
  setRefreshCookie(res, r.refreshToken, r.persistent);
  // The refresh token travels only in the cookie, never in the body.
  const { accessToken, expiresIn, session, user } = r;
  return ok(res, { accessToken, expiresIn, session, user }, message);
};

export async function login(req: Request, res: Response) {
  respond(res, await service.login(req.body), "Signed in");
}

export async function refresh(req: Request, res: Response) {
  try {
    respond(res, await service.refresh(req.cookies?.[COOKIE]), "Session refreshed");
  } catch (e) {
    // A lost race means the browser already holds the winner's newer cookie: leave it alone.
    const race =
      e instanceof HttpError &&
      (e.errors[0] as { code?: string } | undefined)?.code === REFRESH_RACE;
    if (e instanceof HttpError && !race) clearRefreshCookie(res);
    throw e;
  }
}

export async function logout(req: Request, res: Response) {
  await service.logout(req.cookies?.[COOKIE]);
  clearRefreshCookie(res);
  ok(res, null, "Signed out");
}

export async function me(req: Request, res: Response) {
  ok(res, await service.me(req.user!.id));
}
