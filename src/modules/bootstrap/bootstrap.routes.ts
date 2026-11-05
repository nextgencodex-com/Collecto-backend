import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import * as controller from "./bootstrap.controller.js";

export const bootstrapRoutes = Router();

bootstrapRoutes.get("/", authenticate, controller.get);
