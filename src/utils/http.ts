import type { Response } from "express";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: unknown[] = [],
  ) {
    super(message);
  }
}

export const ok = <T>(res: Response, data: T, message = "OK", status = 200, meta?: object) =>
  res.status(status).json({ success: true, message, data, ...(meta && { meta }) });
