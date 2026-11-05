import type { Request, Response } from "express";
import type { z } from "zod";
import { ok } from "../../utils/http.js";
import type { reportParams, reportQuery } from "./reports.schema.js";
import * as service from "./reports.service.js";

export async function generate(req: Request, res: Response) {
  const { date, month, format } = req.query as unknown as z.infer<typeof reportQuery>;
  const type = req.params.type as z.infer<typeof reportParams>["type"];
  const report = await service.build(type, { date, month });
  if (format === "csv") {
    res.type("text/csv").attachment(`${type}-report.csv`).send(service.toCsv(report));
    return;
  }
  ok(res, report);
}
