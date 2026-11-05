import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/http.js";
import { codeParam, createProductBody, stockBody } from "./products.schema.js";
import * as service from "./products.service.js";

export const productRoutes = Router();
productRoutes.use(authenticate, authorize("OWNER"));

productRoutes.get("/", async (_req, res) => {
  ok(res, await service.list());
});

productRoutes.post("/", validate({ body: createProductBody }), async (req, res) => {
  ok(res, await service.create(req.body), "Product created", 201);
});

productRoutes.post(
  "/:code/stock",
  validate({ params: codeParam, body: stockBody }),
  async (req, res) => {
    ok(res, await service.addStock(String(req.params.code), req.body.qty), "Stock added");
  },
);
