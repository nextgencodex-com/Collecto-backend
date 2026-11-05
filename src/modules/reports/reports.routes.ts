import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { ok } from "../../utils/http.js";
import { isoDate } from "../../utils/schemas.js";
import * as service from "./reports.service.js";

export const reportRoutes = Router();
reportRoutes.use(authenticate, authorize("OWNER"));

const params = z.object({
  type: z.enum(["daily", "monthly", "person", "item", "rider", "overdue"]),
});
const query = z.object({
  date: isoDate().optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Enter a valid month.")
    .optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

reportRoutes.get("/:type", validate({ params, query }), async (req, res) => {
  const { date, month, format } = req.query as unknown as z.infer<typeof query>;
  const type = req.params.type as z.infer<typeof params>["type"];
  const report = await service.build(type, { date, month });
  if (format === "csv") {
    res.type("text/csv").attachment(`${type}-report.csv`).send(service.toCsv(report));
    return;
  }
  ok(res, report);
});
