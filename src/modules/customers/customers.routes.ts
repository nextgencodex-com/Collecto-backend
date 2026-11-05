import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { uploadPhoto } from "../../middlewares/upload.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./customers.controller.js";
import {
  assignRiderBody,
  createCustomerBody,
  extensionBody,
  idParam,
  listCustomersQuery,
} from "./customers.schema.js";

export const customerRoutes = Router();
customerRoutes.use(authenticate);

customerRoutes.post(
  "/",
  authorize("OWNER"),
  validate({ body: createCustomerBody }),
  controller.create,
);
customerRoutes.get("/", validate({ query: listCustomersQuery }), controller.list);
customerRoutes.get("/:id", validate({ params: idParam }), controller.get);
customerRoutes.patch(
  "/:id/rider",
  authorize("OWNER"),
  validate({ params: idParam, body: assignRiderBody }),
  controller.assignRider,
);
customerRoutes.post(
  "/:id/extensions",
  authorize("RIDER"),
  validate({ params: idParam, body: extensionBody }),
  controller.addExtension,
);
customerRoutes.put(
  "/:id/photo",
  authorize("OWNER"),
  validate({ params: idParam }),
  uploadPhoto,
  controller.setPhoto,
);
