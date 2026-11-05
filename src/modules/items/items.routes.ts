import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./items.controller.js";
import { createItemBody, listItemsQuery } from "./items.schema.js";

export const itemRoutes = Router();
itemRoutes.use(authenticate);

itemRoutes.post("/", authorize("OWNER"), validate({ body: createItemBody }), controller.create);
itemRoutes.get("/", validate({ query: listItemsQuery }), controller.list);
