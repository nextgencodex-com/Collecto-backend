import { z } from "zod";

export const updateShopBody = z
  .object({
    name: z.string().trim().min(1, "Enter the shop name.").max(120),
    phone: z.string().trim().max(40),
    address: z.string().trim().max(250),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to update.");
