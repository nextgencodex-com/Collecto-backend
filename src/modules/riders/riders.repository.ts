import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

export const listRiders = (db: Db = prisma) =>
  db.user.findMany({ where: { role: "RIDER" }, orderBy: { id: "asc" } });

export const findRider = (id: number, db: Db = prisma) =>
  db.user.findFirst({ where: { id, role: "RIDER" } });

export const findOwner = (db: Db = prisma) =>
  db.user.findFirstOrThrow({ where: { role: "OWNER" } });

export const usernameTaken = async (username: string, exceptId?: number, db: Db = prisma) =>
  !!(await db.user.findFirst({
    where: { username, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  }));

export const phoneTaken = async (phone: string, exceptId?: number, db: Db = prisma) =>
  !!(await db.user.findFirst({
    where: { phone, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  }));

export const createRider = (
  data: {
    name: string;
    phone: string;
    area: string;
    username: string;
    passwordHash: string;
    active: boolean;
  },
  db: Db = prisma,
) => db.user.create({ data: { role: "RIDER", ...data } });

export const updateRider = (id: number, data: Prisma.UserUpdateInput, db: Db = prisma) =>
  db.user.update({ where: { id }, data });

export const setPhoto = (id: number, photoPath: string, db: Db = prisma) =>
  db.user.update({ where: { id }, data: { photoPath } });

/** Ends every session of a user (used when a rider is deactivated or their password changes). */
export const revokeAllSessions = (userId: number, db: Db = prisma) =>
  db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
