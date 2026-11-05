import { Router, type Request } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { uploadPhoto } from "../../middlewares/upload.js";
import { validate } from "../../middlewares/validate.js";
import { HttpError, ok } from "../../utils/http.js";
import { riderId } from "../../utils/ids.js";
import { prefixedId } from "../../utils/schemas.js";
import { createRiderBody, updateRiderBody } from "./riders.schema.js";
import * as service from "./riders.service.js";

export const riderRoutes = Router();
riderRoutes.use(authenticate);

const params = z.object({ id: prefixedId(riderId, "Rider not found.") });
export const fileOf = (req: Request) => {
  if (!req.file) throw new HttpError(422, "Choose an image file.");
  return req.file.buffer;
};

riderRoutes.get("/", authorize("OWNER"), async (_req, res) => {
  ok(res, await service.list());
});

riderRoutes.post("/", authorize("OWNER"), validate({ body: createRiderBody }), async (req, res) => {
  ok(res, await service.create(req.body), "Rider created", 201);
});

// Registered before "/:id/..." so "me" is never parsed as an id.
riderRoutes.put("/me/photo", authorize("RIDER"), uploadPhoto, async (req, res) => {
  ok(res, await service.setRiderPhoto(req.user!.id, fileOf(req)), "Photo updated");
});

riderRoutes.patch(
  "/:id",
  authorize("OWNER"),
  validate({ params, body: updateRiderBody }),
  async (req, res) => {
    ok(res, await service.update(Number(req.params.id), req.body), "Rider updated");
  },
);

riderRoutes.put(
  "/:id/photo",
  authorize("OWNER"),
  validate({ params }),
  uploadPhoto,
  async (req, res) => {
    ok(res, await service.setRiderPhoto(Number(req.params.id), fileOf(req)), "Photo updated");
  },
);
