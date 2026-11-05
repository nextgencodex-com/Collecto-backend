import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/** Parses and replaces body/query/params; a ZodError is turned into a 422 by the error handler. */
export const validate =
  (s: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (s.body) req.body = s.body.parse(req.body);
      if (s.params) Object.defineProperty(req, "params", { value: s.params.parse(req.params) });
      if (s.query) Object.defineProperty(req, "query", { value: s.query.parse(req.query) });
      next();
    } catch (e) {
      next(e);
    }
  };
