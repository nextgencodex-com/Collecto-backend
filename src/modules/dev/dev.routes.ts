import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import * as controller from "./dev.controller.js";

/** Development helpers. Not mounted when NODE_ENV=production (see routes.ts). */
export const devRoutes = Router();
devRoutes.use(authenticate, authorize("OWNER"));

devRoutes.post("/reset", controller.reset);
