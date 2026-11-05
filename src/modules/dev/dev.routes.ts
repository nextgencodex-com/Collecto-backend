import { Router } from "express";
import { seedDatabase } from "../../db/seed.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { ok } from "../../utils/http.js";

/** Development helpers. Not mounted when NODE_ENV=production (see routes.ts). */
export const devRoutes = Router();
devRoutes.use(authenticate, authorize("OWNER"));

devRoutes.post("/reset", async (_req, res) => {
  ok(res, await seedDatabase(), "Demo data restored");
});
