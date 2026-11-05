import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

export const get = (db: Db = prisma) => db.shop.findUniqueOrThrow({ where: { id: 1 } });

export const update = (data: Prisma.ShopUpdateInput, db: Db = prisma) =>
  db.shop.update({ where: { id: 1 }, data });
