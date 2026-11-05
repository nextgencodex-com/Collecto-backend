import { Router } from "express";
import { dbHealthy } from "../../config/database.js";

export const healthRoutes = Router();

healthRoutes.get("/health", async (_req, res) => {
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
});
