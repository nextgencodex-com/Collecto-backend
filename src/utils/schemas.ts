import { z } from "zod";
import type { IdCodec } from "./ids.js";

/** "C101" -> 101. Rejects anything that isn't the expected prefixed id. */
export const prefixedId = (codec: IdCodec, msg = "Invalid id") =>
  z.string().transform((s, ctx) => {
    const n = codec.parse(s);
    if (n === null) ctx.addIssue({ code: "custom", message: msg });
    return n ?? 0;
  });

export const isoDate = (msg = "Enter a valid date.") =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const pageMeta = (total: number, page: number, pageSize: number) => ({
  total,
  page,
  pageSize,
  pages: Math.max(1, Math.ceil(total / pageSize)),
});
