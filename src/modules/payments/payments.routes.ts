import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./payments.controller.js";
import {
  correctPaymentBody,
  idParam,
  listPaymentsQuery,
  recordPaymentsBody,
} from "./payments.schema.js";

export const paymentRoutes = Router();
paymentRoutes.use(authenticate);

paymentRoutes.post(
  "/",
  authorize("RIDER"),
  validate({ body: recordPaymentsBody }),
  controller.record,
);
paymentRoutes.get("/", validate({ query: listPaymentsQuery }), controller.list);
paymentRoutes.patch(
  "/:id",
  authorize("OWNER"),
  validate({ params: idParam, body: correctPaymentBody }),
  controller.correct,
);
