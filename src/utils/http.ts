import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: unknown[] = [],
  ) {
    super(message);
  }
}

export const ok = <T>(res: Response, data: T, message = "OK", status = 200) =>
  res.status(status).json({ success: true, message, data });

/** Forwards async handler rejections to the error middleware (Express 4 does not). */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
