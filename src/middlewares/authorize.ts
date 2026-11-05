import type { RequestHandler } from "express";
import type { AuthRole } from "../types/express.js";
import { HttpError } from "../utils/http.js";

/** Use after `authenticate`. Resource-level (ownership) checks live in the services. */
export const authorize =
  (...roles: AuthRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw new HttpError(401, "Authentication required");
    if (!roles.includes(req.user.role))
      throw new HttpError(403, "You do not have permission to do this");
    next();
  };
