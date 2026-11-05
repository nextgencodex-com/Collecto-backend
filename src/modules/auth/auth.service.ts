import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import type { User } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/http.js";
import { riderId } from "../../utils/ids.js";
import { formatPhone } from "../../utils/phone.js";
import { photoUrl } from "../../utils/uploads.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import type { LoginInput } from "./auth.schema.js";
import * as repo from "./auth.repository.js";
import { hashRefreshToken, newRefreshToken, signAccessToken } from "./auth.tokens.js";

/** A refresh token revoked this recently is treated as a harmless race (two tabs), not theft. */
const REUSE_GRACE_MS = 10_000;

/** Marks a refresh rejected only because another request rotated the same token first (e.g. two tabs). */
export const REFRESH_RACE = "refresh_race";
const raceError = () => new HttpError(401, "Session expired", [{ code: REFRESH_RACE }]);

export const BAD_CREDENTIALS = "Incorrect username or password.";
const INACTIVE = "This rider account is inactive. Please contact the owner.";

// Verified against when the user doesn't exist, so response time doesn't reveal valid usernames.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("collecto-dummy-password"));

export function toUserDto(u: User) {
  return {
    id: u.role === "OWNER" ? "owner" : riderId.format(u.id),
    role: u.role === "OWNER" ? ("owner" as const) : ("rider" as const),
    name: u.name,
    username: u.username,
    phone: u.phone,
    photoUrl: photoUrl(u.photoPath) || null,
  };
}

/** Same shape as the frontend's Session type. */
export const toSession = (u: User) =>
  u.role === "OWNER"
    ? { role: "owner" as const }
    : { role: "rider" as const, riderId: riderId.format(u.id) };

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000);

async function issue(user: User, family: { familyId: string; persistent: boolean }) {
  const refreshToken = newRefreshToken();
  await repo.createRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    familyId: family.familyId,
    persistent: family.persistent,
    expiresAt: refreshExpiry(),
  });
  const access = signAccessToken(user.id, user.role);
  return {
    accessToken: access.token,
    expiresIn: access.expiresIn,
    refreshToken,
    persistent: family.persistent,
    session: toSession(user),
    user: toUserDto(user),
  };
}

export async function login(input: LoginInput) {
  const id = input.username.toLowerCase();
  const user =
    input.role === "owner"
      ? await repo.findOwnerForLogin(id)
      : await repo.findRiderForLogin(id, formatPhone(id));

  const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);
  if (!user || !valid) throw new HttpError(401, BAD_CREDENTIALS);
  if (!user.active) throw new HttpError(403, INACTIVE);

  await repo.deleteExpiredForUser(user.id);
  return issue(user, { familyId: randomUUID(), persistent: input.remember });
}

/** Rotates the refresh token. Reuse of an already-rotated token revokes the whole family. */
export async function refresh(presented: string | undefined) {
  if (!presented) throw new HttpError(401, "Session expired");
  const row = await repo.findRefreshByHash(hashRefreshToken(presented));
  if (!row) throw new HttpError(401, "Session expired");

  if (row.revokedAt) {
    if (Date.now() - row.revokedAt.getTime() <= REUSE_GRACE_MS) throw raceError();
    await repo.revokeFamily(row.familyId); // an old token replayed later: treat as theft
    throw new HttpError(401, "Session expired");
  }
  if (row.expiresAt <= new Date()) throw new HttpError(401, "Session expired");

  const user = await repo.findUserById(row.userId);
  if (!user || !user.active) {
    await repo.revokeFamily(row.familyId);
    throw new HttpError(401, "Session expired");
  }

  // Only one concurrent request may win the rotation; the loser is treated as a race.
  if (!(await repo.revokeRefreshIfActive(row.id))) throw raceError();
  return issue(user, { familyId: row.familyId, persistent: row.persistent });
}

export async function logout(presented: string | undefined) {
  if (!presented) return;
  const row = await repo.findRefreshByHash(hashRefreshToken(presented));
  if (row) await repo.revokeFamily(row.familyId);
}

export async function me(userId: number) {
  const user = await repo.findUserById(userId);
  if (!user || !user.active) throw new HttpError(401, "Session expired");
  return { session: toSession(user), user: toUserDto(user) };
}
