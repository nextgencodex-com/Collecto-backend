import { z } from "zod";

export const listNotificationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
