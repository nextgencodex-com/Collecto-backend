import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

export const findForDay = (riderId: number, date: Date, db: Db = prisma) =>
  db.closing.findUnique({ where: { riderId_date: { riderId, date } } });

export const create = (data: Prisma.ClosingUncheckedCreateInput, db: Db = prisma) =>
  db.closing.create({ data });

export const list = (riderId: number | undefined, db: Db = prisma) =>
  db.closing.findMany({ where: riderId ? { riderId } : undefined, orderBy: { id: "desc" } });
