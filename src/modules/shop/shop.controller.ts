import type { Request, Response } from "express";
import { uploadedFile } from "../../middlewares/upload.js";
import { ok } from "../../utils/http.js";
import { setOwnerPhoto } from "../riders/riders.service.js";
import * as service from "./shop.service.js";

export async function get(_req: Request, res: Response) {
  ok(res, await service.get());
}

export async function update(req: Request, res: Response) {
  ok(res, await service.update(req.body), "Shop updated");
}

export async function ownerPhoto(req: Request, res: Response) {
  ok(res, await setOwnerPhoto(uploadedFile(req)), "Photo updated");
}
