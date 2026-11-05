import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./notifications.controller.js";
import { listNotificationsQuery } from "./notifications.schema.js";

export const notificationRoutes = Router();
notificationRoutes.use(authenticate, authorize("OWNER"));

notificationRoutes.get("/", validate({ query: listNotificationsQuery }), controller.list);
notificationRoutes.post("/read-all", controller.markAllRead);
