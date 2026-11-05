import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import * as service from "./closings.service.js";

export async function submit(req: Request, res: Response) {
  ok(res, await service.submit(req.user!, req.body), "Daily closing submitted", 201);
}

export async function list(req: Request, res: Response) {
  ok(res, await service.list(req.user!));
}
