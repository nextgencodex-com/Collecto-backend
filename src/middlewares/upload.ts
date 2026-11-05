import multer from "multer";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Accepts one file in the `photo` field, buffered in memory (max 2 MB). Content is verified in saveImage. */
export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 },
}).single("photo");
