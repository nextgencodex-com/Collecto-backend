import { Router } from "express";
import { healthRoutes } from "./modules/health/health.routes.js";

export const api = Router();
api.use(healthRoutes);
// Feature module routers are mounted here as they are built.
