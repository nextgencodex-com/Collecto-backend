import { Router } from "express";
import * as controller from "./health.controller.js";

export const healthRoutes = Router();

healthRoutes.get("/health", controller.check);
