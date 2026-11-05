import { z } from "zod";
import { isoDate } from "../../utils/schemas.js";

export const reportParams = z.object({
  type: z.enum(["daily", "monthly", "person", "item", "rider", "overdue"]),
});
export const reportQuery = z.object({
  date: isoDate().optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Enter a valid month.")
    .optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
