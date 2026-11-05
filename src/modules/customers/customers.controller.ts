import type { Request, Response } from "express";
import { uploadedFile } from "../../middlewares/upload.js";
import { ok } from "../../utils/http.js";
import { pageMeta } from "../../utils/schemas.js";
import * as service from "./customers.service.js";

export async function create(req: Request, res: Response) {
  ok(res, await service.create(req.body), "Customer created", 201);
}

export async function list(req: Request, res: Response) {
  const q = req.query as unknown as Parameters<typeof service.list>[1];
  const { rows, total } = await service.list(req.user!, q);
  ok(res, rows, "OK", 200, pageMeta(total, q.page, q.pageSize));
}

export async function get(req: Request, res: Response) {
  ok(res, await service.get(req.user!, Number(req.params.id)));
}

export async function assignRider(req: Request, res: Response) {
  ok(res, await service.assignRider(Number(req.params.id), req.body.riderId), "Rider assigned");
}

export async function addExtension(req: Request, res: Response) {
  ok(
    res,
    await service.addExtension(req.user!, Number(req.params.id), req.body),
    "Payment extended",
    201,
  );
}

export async function setPhoto(req: Request, res: Response) {
  ok(res, await service.setPhoto(Number(req.params.id), uploadedFile(req)), "Photo updated");
}
