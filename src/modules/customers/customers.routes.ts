import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { uploadPhoto } from "../../middlewares/upload.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/http.js";
import { pageMeta } from "../../utils/schemas.js";
import { fileOf } from "../riders/riders.routes.js";
import {
  assignRiderBody,
  createCustomerBody,
  extensionBody,
  idParam,
  listCustomersQuery,
} from "./customers.schema.js";
import * as service from "./customers.service.js";

export const customerRoutes = Router();
customerRoutes.use(authenticate);

customerRoutes.post(
  "/",
  authorize("OWNER"),
  validate({ body: createCustomerBody }),
  async (req, res) => {
    ok(res, await service.create(req.body), "Customer created", 201);
  },
);

customerRoutes.get("/", validate({ query: listCustomersQuery }), async (req, res) => {
  const q = req.query as unknown as {
    q?: string;
    riderId?: number;
    page: number;
    pageSize: number;
  };
  const { rows, total } = await service.list(req.user!, q);
  ok(res, rows, "OK", 200, pageMeta(total, q.page, q.pageSize));
});

customerRoutes.get("/:id", validate({ params: idParam }), async (req, res) => {
  ok(res, await service.get(req.user!, Number(req.params.id)));
});

customerRoutes.patch(
  "/:id/rider",
  authorize("OWNER"),
  validate({ params: idParam, body: assignRiderBody }),
  async (req, res) => {
    ok(res, await service.assignRider(Number(req.params.id), req.body.riderId), "Rider assigned");
  },
);

customerRoutes.post(
  "/:id/extensions",
  authorize("RIDER"),
  validate({ params: idParam, body: extensionBody }),
  async (req, res) => {
    ok(
      res,
      await service.addExtension(req.user!, Number(req.params.id), req.body),
      "Payment extended",
      201,
    );
  },
);

customerRoutes.put(
  "/:id/photo",
  authorize("OWNER"),
  validate({ params: idParam }),
  uploadPhoto,
  async (req, res) => {
    ok(res, await service.setPhoto(Number(req.params.id), fileOf(req)), "Photo updated");
  },
);
