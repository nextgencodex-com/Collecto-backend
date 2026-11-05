import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

export const create = (data: Prisma.ItemUncheckedCreateInput, db: Db = prisma) =>
  db.item.create({ data });

export const list = (f: { customerId?: number; riderId?: number }, db: Db = prisma) =>
  db.item.findMany({
    where: {
      ...(f.customerId && { customerId: f.customerId }),
      ...(f.riderId && { customer: { riderId: f.riderId } }),
    },
    orderBy: { id: "asc" },
  });

export const listByCustomer = (customerId: number, db: Db = prisma) =>
  db.item.findMany({ where: { customerId }, orderBy: { id: "asc" } });

/** Items of one customer, restricted to the given ids. */
export const findForCustomer = (customerId: number, ids: number[], db: Db = prisma) =>
  db.item.findMany({ where: { customerId, id: { in: ids } } });
