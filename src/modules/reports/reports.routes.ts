import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./reports.controller.js";
import { reportParams, reportQuery } from "./reports.schema.js";

export const reportRoutes = Router();
reportRoutes.use(authenticate, authorize("OWNER"));

reportRoutes.get(
  "/:type",
  validate({ params: reportParams, query: reportQuery }),
  controller.generate,
);
