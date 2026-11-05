import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/http.js";
import * as service from "./notifications.service.js";

export const notificationRoutes = Router();
notificationRoutes.use(authenticate, authorize("OWNER"));

export const listNotificationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

notificationRoutes.get("/", validate({ query: listNotificationsQuery }), async (req, res) => {
  ok(res, await service.list(req.user!.id, Number(req.query.limit)));
});

notificationRoutes.post("/read-all", async (req, res) => {
  await service.markAllRead(req.user!.id);
  ok(res, null, "All notifications marked as read");
});
