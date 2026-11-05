import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import * as service from "./notifications.service.js";

export async function list(req: Request, res: Response) {
  ok(res, await service.list(req.user!.id, Number(req.query.limit)));
}

export async function markAllRead(req: Request, res: Response) {
  await service.markAllRead(req.user!.id);
  ok(res, null, "All notifications marked as read");
}
