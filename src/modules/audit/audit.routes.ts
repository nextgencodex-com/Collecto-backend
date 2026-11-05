import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { pageQuery } from "../../utils/schemas.js";
import * as controller from "./audit.controller.js";

export const auditRoutes = Router();
auditRoutes.use(authenticate, authorize("OWNER"));

auditRoutes.get("/", validate({ query: pageQuery }), controller.list);
