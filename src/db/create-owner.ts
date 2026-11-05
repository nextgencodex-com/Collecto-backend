import { z } from "zod";
import { prisma as defaultPrisma } from "../config/database.js";
import { hashPassword } from "../utils/password.js";

type Db = typeof defaultPrisma;

export const ownerInput = z.object({
  name: z.string().trim().min(2, "Enter the owner's name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, "Username must be 3-50 characters (letters, numbers, . _ -)."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  shopName: z.string().trim().min(1).max(120).default("My Shop"),
});
export type OwnerInput = z.input<typeof ownerInput>;

/**
 * Creates the one owner account (user id 0, enforced by a database constraint) and the shop row the app
 * needs. Works in any environment, unlike the demo seed, which refuses to run in production.
 * Throws if an owner already exists, or if the username/email is taken by a rider.
 */
export async function createOwner(input: OwnerInput, prisma: Db = defaultPrisma) {
  const o = ownerInput.parse(input);
  if (await prisma.user.findFirst({ where: { role: "OWNER" }, select: { id: true } }))
    throw new Error("An owner account already exists.");
  if (
    await prisma.user.findFirst({
      where: { OR: [{ username: o.username }, { email: o.email }] },
      select: { id: true },
    })
  )
    throw new Error("That username or email is already in use.");

  const passwordHash = await hashPassword(o.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: 0,
        role: "OWNER",
        username: o.username,
        email: o.email,
        name: o.name,
        passwordHash,
      },
      select: { id: true, username: true, email: true, name: true },
    });
    // The app expects exactly one shop row; keep an existing one (e.g. restored from a backup).
    await tx.shop.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, name: o.shopName, phone: "", address: "" },
    });
    return user;
  });
}
