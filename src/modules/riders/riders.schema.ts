import { z } from "zod";
import { riderId } from "../../utils/ids.js";
import { formatPhone } from "../../utils/phone.js";
import { prefixedId } from "../../utils/schemas.js";

const name = z.string().trim().min(1, "Enter the rider name.").max(100);
const phone = z.string().transform((s, ctx) => {
  const f = formatPhone(s);
  if (!f) ctx.addIssue({ code: "custom", message: "Phone number must have 10 digits." });
  return f ?? "";
});
const area = z.string().trim().min(1, "Enter the assigned area.").max(100);
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,50}$/,
    "Username must be at least 3 characters (letters, numbers, . _ -).",
  );
const password = z.string().min(4, "Password must be at least 4 characters.").max(200);

export const createRiderBody = z.object({
  name,
  phone,
  area,
  username,
  password,
  active: z.boolean().default(true),
});

export const updateRiderBody = z
  .object({ name, phone, area, username, password, active: z.boolean() })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to update.");

export const idParam = z.object({ id: prefixedId(riderId, "Rider not found.") });
