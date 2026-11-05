import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { HttpError } from "./http.js";

export const uploadsDir = () => path.resolve(env.UPLOADS_DIR);

/** Detects the real image type from magic bytes; the client's mimetype/filename are not trusted. */
function sniff(b: Buffer): "jpg" | "png" | "webp" | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (
    b.length > 12 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    b.length > 12 &&
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    return "webp";
  return null;
}

/** Stores the image under a random, unguessable name and returns that name. */
export async function saveImage(buf: Buffer): Promise<string> {
  const ext = sniff(buf);
  if (!ext) throw new HttpError(422, "Only JPEG, PNG or WebP images are allowed.");
  await mkdir(uploadsDir(), { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(uploadsDir(), name), buf, { flag: "wx" });
  return name;
}

/** Deletes a stored image; ignores anything that isn't one of our generated names. */
export async function removeImage(name: string | null | undefined) {
  if (!name || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name)) return;
  await rm(path.join(uploadsDir(), name), { force: true });
}

/** Stored name -> public URL, or "" when there is no photo (what the frontend expects). */
export const photoUrl = (name: string | null | undefined) =>
  name ? `${env.UPLOADS_PUBLIC_URL.replace(/\/$/, "")}/${name}` : "";
