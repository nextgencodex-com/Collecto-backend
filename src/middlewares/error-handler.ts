import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { HttpError } from "../utils/http.js";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, message: "Route not found", errors: [] });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message, errors: err.errors });
    return;
  }
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  // 4xx raised by Express itself (e.g. malformed JSON, payload too large)
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ success: false, message: "Bad request", errors: [] });
    return;
  }
  logger.error({ err, url: req.originalUrl }, "Unhandled error");
  res.status(500).json({ success: false, message: "Internal server error", errors: [] });
};
