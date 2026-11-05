import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { ok } from "../../utils/http.js";
import * as service from "./bootstrap.service.js";

export const bootstrapRoutes = Router();

bootstrapRoutes.get("/", authenticate, async (req, res) => {
  ok(res, await service.bootstrap(req.user!));
});
