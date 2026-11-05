import type { Request } from "express";
import multer from "multer";
import { HttpError } from "../utils/http.js";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Accepts one file in the `photo` field, buffered in memory (max 2 MB). Content is verified in saveImage. */
export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 },
}).single("photo");

/** The uploaded image's bytes; 422 when the request had no file. */
export const uploadedFile = (req: Request): Buffer => {
  if (!req.file) throw new HttpError(422, "Choose an image file.");
  return req.file.buffer;
};
