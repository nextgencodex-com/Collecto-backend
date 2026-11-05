import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/http.js";
import { createItemBody, listItemsQuery } from "./items.schema.js";
import * as service from "./items.service.js";

export const itemRoutes = Router();
itemRoutes.use(authenticate);

itemRoutes.post("/", authorize("OWNER"), validate({ body: createItemBody }), async (req, res) => {
  ok(res, await service.create(req.body), "Item added", 201);
});

itemRoutes.get("/", validate({ query: listItemsQuery }), async (req, res) => {
  const { customerId } = req.query as unknown as { customerId?: number };
  ok(res, await service.list(req.user!, customerId));
});
