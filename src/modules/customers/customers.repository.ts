import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

export const create = (data: Prisma.CustomerUncheckedCreateInput, db: Db = prisma) =>
  db.customer.create({ data });

export const nicExists = async (nic: string, db: Db = prisma) =>
  !!(await db.customer.findUnique({ where: { nic }, select: { id: true } }));

/** `riderId` restricts the lookup to that rider's customers (resource-level authorisation). */
export const findById = (id: number, riderId?: number, db: Db = prisma) =>
  db.customer.findFirst({ where: { id, ...(riderId && { riderId }) } });

export async function list(
  f: { riderId?: number; q?: string; ids?: number[]; skip: number; take: number },
  db: Db = prisma,
) {
  const where: Prisma.CustomerWhereInput = {
    ...(f.riderId && { riderId: f.riderId }),
    ...(f.ids && { id: { in: f.ids } }),
  };
  if (f.q) {
    const digits = f.q.replace(/\D/g, "");
    // Phone numbers are stored formatted ("077 512 3344"), so digit searches compare digits only.
    const byPhone =
      digits.length > 2
        ? (
            await db.$queryRaw<{ id: number }[]>`
              SELECT id FROM "Customer" WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${"%" + digits + "%"}`
          ).map((r) => r.id)
        : [];
    where.OR = [
      { name: { contains: f.q, mode: "insensitive" } },
      { nic: { contains: f.q, mode: "insensitive" } },
      ...(byPhone.length ? [{ id: { in: byPhone } }] : []),
    ];
  }
  const [rows, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: { id: "asc" }, skip: f.skip, take: f.take }),
    db.customer.count({ where }),
  ]);
  return { rows, total };
}

/** Moves a customer and all of their items to another rider. */
export async function reassign(customerId: number, riderId: number, db: Db) {
  const customer = await db.customer.update({ where: { id: customerId }, data: { riderId } });
  await db.item.updateMany({ where: { customerId }, data: { riderId } });
  return customer;
}

export const setPhoto = (id: number, photoPath: string, db: Db = prisma) =>
  db.customer.update({ where: { id }, data: { photoPath } });

export const createExtension = (data: Prisma.ExtensionUncheckedCreateInput, db: Db = prisma) =>
  db.extension.create({ data });
