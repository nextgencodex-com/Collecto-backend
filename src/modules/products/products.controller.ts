import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import * as service from "./products.service.js";

export async function list(_req: Request, res: Response) {
  ok(res, await service.list());
}

export async function create(req: Request, res: Response) {
  ok(res, await service.create(req.body), "Product created", 201);
}

export async function addStock(req: Request, res: Response) {
  ok(res, await service.addStock(String(req.params.code), req.body.qty), "Stock added");
}
