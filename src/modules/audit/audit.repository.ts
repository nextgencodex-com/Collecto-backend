import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;
export interface NewAudit {
  userId: number;
  action: string;
  txn: string;
  ref: string;
  old: string;
  nw: string;
  reason: string;
}

export const create = (data: NewAudit, db: Db = prisma) => db.auditEntry.create({ data });

export const list = (skip: number, take: number, db: Db = prisma) =>
  Promise.all([
    db.auditEntry.findMany({
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip,
      take,
      include: { user: { select: { name: true } } },
    }),
    db.auditEntry.count(),
  ]);
