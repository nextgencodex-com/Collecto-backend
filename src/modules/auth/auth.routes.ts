import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { loginLimiter } from "../../middlewares/rate-limit.js";
import { trustedOrigin } from "../../middlewares/trusted-origin.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./auth.controller.js";
import { loginBody } from "./auth.schema.js";

export const authRoutes = Router();

authRoutes.post("/login", loginLimiter, validate({ body: loginBody }), controller.login);
authRoutes.post("/refresh", trustedOrigin, controller.refresh);
authRoutes.post("/logout", trustedOrigin, controller.logout);
authRoutes.get("/me", authenticate, controller.me);
