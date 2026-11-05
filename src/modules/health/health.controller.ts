import type { Request, Response } from "express";
import { dbHealthy } from "../../config/database.js";

export async function check(_req: Request, res: Response) {
  const db = await dbHealthy();
  res.status(db ? 200 : 503).json({
    success: db,
    message: db ? "OK" : "Database unavailable",
    data: {
      status: db ? "ok" : "degraded",
      db: db ? "up" : "down",
      uptime: Math.round(process.uptime()),
    },
  });
}
