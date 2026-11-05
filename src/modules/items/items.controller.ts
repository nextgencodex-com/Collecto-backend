import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import * as service from "./items.service.js";

export async function create(req: Request, res: Response) {
  ok(res, await service.create(req.body), "Item added", 201);
}

export async function list(req: Request, res: Response) {
  const { customerId } = req.query as unknown as { customerId?: number };
  ok(res, await service.list(req.user!, customerId));
}
