import { Router } from "express";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";

export const api = Router();
api.use(healthRoutes);
api.use("/auth", authRoutes);
// Feature module routers are mounted here as they are built.
