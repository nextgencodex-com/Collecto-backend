import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./closings.controller.js";
import { submitClosingBody } from "./closings.schema.js";

export const closingRoutes = Router();
closingRoutes.use(authenticate);

closingRoutes.post(
  "/",
  authorize("RIDER"),
  validate({ body: submitClosingBody }),
  controller.submit,
);
closingRoutes.get("/", controller.list);
