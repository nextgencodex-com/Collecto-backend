import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { auditDto } from "../../utils/dto.js";
import { ok } from "../../utils/http.js";
import { pageMeta, pageQuery } from "../../utils/schemas.js";
import * as repo from "./audit.repository.js";

export const auditRoutes = Router();
auditRoutes.use(authenticate, authorize("OWNER"));

auditRoutes.get("/", validate({ query: pageQuery }), async (req, res) => {
  const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
  const [rows, total] = await repo.list((page - 1) * pageSize, pageSize);
  ok(res, rows.map(auditDto), "OK", 200, pageMeta(total, page, pageSize));
});
