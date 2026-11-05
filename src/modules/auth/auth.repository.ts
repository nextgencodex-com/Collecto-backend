import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

export const findOwnerForLogin = (identifier: string, db: Db = prisma) =>
  db.user.findFirst({
    where: { role: "OWNER", OR: [{ email: identifier }, { username: identifier }] },
  });

/** `formattedPhone` is the stored form, e.g. "077 245 8812"; null when the input isn't a phone number. */
export const findRiderForLogin = (
  identifier: string,
  formattedPhone: string | null,
  db: Db = prisma,
) =>
  db.user.findFirst({
    where: {
      role: "RIDER",
      OR: [{ username: identifier }, ...(formattedPhone ? [{ phone: formattedPhone }] : [])],
    },
  });

export const findUserById = (id: number, db: Db = prisma) => db.user.findUnique({ where: { id } });

export const createRefreshToken = (
  data: {
    userId: number;
    tokenHash: string;
    familyId: string;
    persistent: boolean;
    expiresAt: Date;
  },
  db: Db = prisma,
) => db.refreshToken.create({ data });

export const findRefreshByHash = (tokenHash: string, db: Db = prisma) =>
  db.refreshToken.findUnique({ where: { tokenHash } });

/** Atomically revokes one token; returns false if someone else already revoked it. */
export const revokeRefreshIfActive = async (id: number, db: Db = prisma) =>
  (
    await db.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  ).count === 1;

export const revokeFamily = (familyId: string, db: Db = prisma) =>
  db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export const deleteExpiredForUser = (userId: number, db: Db = prisma) =>
  db.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
