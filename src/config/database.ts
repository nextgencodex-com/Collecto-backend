import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";

// Pool size comes from DB_POOL_MAX.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX }),
});

/** True if the database answers a trivial query. */
export async function dbHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Runs `fn` in one database transaction; services use this to compose repository calls atomically. */
export const inTransaction = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
  prisma.$transaction(fn, { timeout: 15_000 });
