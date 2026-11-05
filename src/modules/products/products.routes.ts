import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./products.controller.js";
import { codeParam, createProductBody, stockBody } from "./products.schema.js";

export const productRoutes = Router();
productRoutes.use(authenticate, authorize("OWNER"));

productRoutes.get("/", controller.list);
productRoutes.post("/", validate({ body: createProductBody }), controller.create);
productRoutes.post(
  "/:code/stock",
  validate({ params: codeParam, body: stockBody }),
  controller.addStock,
);
