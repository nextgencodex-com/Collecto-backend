import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import { pageMeta } from "../../utils/schemas.js";
import * as service from "./audit.service.js";

export async function list(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
  const { rows, total } = await service.list(page, pageSize);
  ok(res, rows, "OK", 200, pageMeta(total, page, pageSize));
}
