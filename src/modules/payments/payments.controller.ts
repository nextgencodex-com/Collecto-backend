import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import { pageMeta } from "../../utils/schemas.js";
import * as service from "./payments.service.js";

export async function record(req: Request, res: Response) {
  ok(res, await service.record(req.user!, req.body), "Payment recorded", 201);
}

export async function list(req: Request, res: Response) {
  const q = req.query as unknown as Parameters<typeof service.list>[1];
  const { rows, total } = await service.list(req.user!, q);
  ok(res, rows, "OK", 200, pageMeta(total, q.page, q.pageSize));
}

export async function correct(req: Request, res: Response) {
  ok(res, await service.correct(req.user!, Number(req.params.id), req.body), "Payment corrected");
}
