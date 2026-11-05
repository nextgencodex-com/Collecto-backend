import type { Request, Response } from "express";
import { uploadedFile } from "../../middlewares/upload.js";
import { ok } from "../../utils/http.js";
import * as service from "./riders.service.js";

export async function list(_req: Request, res: Response) {
  ok(res, await service.list());
}

export async function create(req: Request, res: Response) {
  ok(res, await service.create(req.body), "Rider created", 201);
}

export async function update(req: Request, res: Response) {
  ok(res, await service.update(Number(req.params.id), req.body), "Rider updated");
}

export async function setPhoto(req: Request, res: Response) {
  ok(res, await service.setRiderPhoto(Number(req.params.id), uploadedFile(req)), "Photo updated");
}

export async function setMyPhoto(req: Request, res: Response) {
  ok(res, await service.setRiderPhoto(req.user!.id, uploadedFile(req)), "Photo updated");
}
