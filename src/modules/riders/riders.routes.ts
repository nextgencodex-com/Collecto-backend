import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { uploadPhoto } from "../../middlewares/upload.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./riders.controller.js";
import { createRiderBody, idParam, updateRiderBody } from "./riders.schema.js";

export const riderRoutes = Router();
riderRoutes.use(authenticate);

riderRoutes.get("/", authorize("OWNER"), controller.list);
riderRoutes.post("/", authorize("OWNER"), validate({ body: createRiderBody }), controller.create);
// Registered before "/:id/..." so "me" is never parsed as an id.
riderRoutes.put("/me/photo", authorize("RIDER"), uploadPhoto, controller.setMyPhoto);
riderRoutes.patch(
  "/:id",
  authorize("OWNER"),
  validate({ params: idParam, body: updateRiderBody }),
  controller.update,
);
riderRoutes.put(
  "/:id/photo",
  authorize("OWNER"),
  validate({ params: idParam }),
  uploadPhoto,
  controller.setPhoto,
);
