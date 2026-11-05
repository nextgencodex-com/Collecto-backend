import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/http.js";
import { pageMeta } from "../../utils/schemas.js";
import {
  correctPaymentBody,
  idParam,
  listPaymentsQuery,
  recordPaymentsBody,
} from "./payments.schema.js";
import * as service from "./payments.service.js";

export const paymentRoutes = Router();
paymentRoutes.use(authenticate);

paymentRoutes.post(
  "/",
  authorize("RIDER"),
  validate({ body: recordPaymentsBody }),
  async (req, res) => {
    ok(res, await service.record(req.user!, req.body), "Payment recorded", 201);
  },
);

paymentRoutes.get("/", validate({ query: listPaymentsQuery }), async (req, res) => {
  const q = req.query as unknown as Parameters<typeof service.list>[1];
  const { rows, total } = await service.list(req.user!, q);
  ok(res, rows, "OK", 200, pageMeta(total, q.page, q.pageSize));
});

paymentRoutes.patch(
  "/:id",
  authorize("OWNER"),
  validate({ params: idParam, body: correctPaymentBody }),
  async (req, res) => {
    ok(res, await service.correct(req.user!, Number(req.params.id), req.body), "Payment corrected");
  },
);
