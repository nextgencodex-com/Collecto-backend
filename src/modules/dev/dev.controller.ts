import type { Request, Response } from "express";
import { seedDatabase } from "../../db/seed.js";
import { ok } from "../../utils/http.js";

export async function reset(_req: Request, res: Response) {
  ok(res, await seedDatabase(), "Demo data restored");
}
