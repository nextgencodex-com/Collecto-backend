import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { uploadPhoto } from "../../middlewares/upload.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/http.js";
import { fileOf } from "../riders/riders.routes.js";
import { setOwnerPhoto } from "../riders/riders.service.js";
import * as service from "./shop.service.js";

export const shopRoutes = Router();
shopRoutes.use(authenticate);

const updateBody = z
  .object({
    name: z.string().trim().min(1, "Enter the shop name.").max(120),
    phone: z.string().trim().max(40),
    address: z.string().trim().max(250),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to update.");

shopRoutes.get("/", async (_req, res) => {
  ok(res, await service.get());
});

shopRoutes.patch("/", authorize("OWNER"), validate({ body: updateBody }), async (req, res) => {
  ok(res, await service.update(req.body), "Shop updated");
});

shopRoutes.put("/owner-photo", authorize("OWNER"), uploadPhoto, async (req, res) => {
  ok(res, await setOwnerPhoto(fileOf(req)), "Photo updated");
});
