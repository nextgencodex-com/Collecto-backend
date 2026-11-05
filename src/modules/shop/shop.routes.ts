import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { uploadPhoto } from "../../middlewares/upload.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./shop.controller.js";
import { updateShopBody } from "./shop.schema.js";

export const shopRoutes = Router();
shopRoutes.use(authenticate);

shopRoutes.get("/", controller.get);
shopRoutes.patch("/", authorize("OWNER"), validate({ body: updateShopBody }), controller.update);
shopRoutes.put("/owner-photo", authorize("OWNER"), uploadPhoto, controller.ownerPhoto);
