import { z } from "zod";
import { customerId, riderId } from "../../utils/ids.js";
import { formatPhone } from "../../utils/phone.js";
import { isoDate, pageQuery, prefixedId } from "../../utils/schemas.js";

export const createCustomerBody = z.object({
  name: z.string().trim().min(3, "Enter the customer's full name.").max(120),
  nic: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(\d{9}[VX]|\d{12})$/, "NIC must be 9 digits followed by V/X, or 12 digits."),
  phone: z.string().transform((s, ctx) => {
    const f = formatPhone(s);
    if (!f) ctx.addIssue({ code: "custom", message: "Phone number must have 10 digits." });
    return f ?? "";
  }),
  address: z.string().trim().min(1, "Enter the address and city/area.").max(250),
  city: z.string().trim().min(1, "Enter the address and city/area.").max(100),
  lat: z
    .number({ error: "Set the customer location on the map." })
    .min(-90, "Set the customer location on the map.")
    .max(90, "Set the customer location on the map."),
  lng: z
    .number({ error: "Set the customer location on the map." })
    .min(-180, "Set the customer location on the map.")
    .max(180, "Set the customer location on the map."),
  riderId: prefixedId(riderId, "Assign a rider."),
  notes: z.string().trim().max(500).default(""),
});

export const idParam = z.object({ id: prefixedId(customerId, "Customer not found.") });
export const assignRiderBody = z.object({ riderId: prefixedId(riderId, "Assign a rider.") });

export const extensionBody = z.object({
  until: isoDate("Choose a date after today."),
  reason: z.string().trim().min(3, "Add a short reason for the extension.").max(250),
});

export const listCustomersQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  riderId: prefixedId(riderId, "Invalid rider.").optional(),
});
