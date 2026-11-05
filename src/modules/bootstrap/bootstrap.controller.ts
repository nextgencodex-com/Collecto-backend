import type { Request, Response } from "express";
import { ok } from "../../utils/http.js";
import * as service from "./bootstrap.service.js";

export async function get(req: Request, res: Response) {
  ok(res, await service.bootstrap(req.user!));
}
