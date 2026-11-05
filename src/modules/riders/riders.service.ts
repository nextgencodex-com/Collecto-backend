import { inTransaction } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { ownerDto, riderDto } from "../../utils/dto.js";
import { HttpError } from "../../utils/http.js";
import { hashPassword } from "../../utils/password.js";
import { removeImage, saveImage } from "../../utils/uploads.js";
import * as repo from "./riders.repository.js";

const notFound = () => new HttpError(404, "Rider not found.");

export async function list() {
  return (await repo.listRiders()).map(riderDto);
}

export async function create(input: {
  name: string;
  phone: string;
  area: string;
  username: string;
  password: string;
  active: boolean;
}) {
  if (await repo.usernameTaken(input.username))
    throw new HttpError(409, "This username is already taken.");
  if (await repo.phoneTaken(input.phone))
    throw new HttpError(409, "This phone number is already used by another rider.");
  const { password, ...rest } = input;
  return riderDto(await repo.createRider({ ...rest, passwordHash: await hashPassword(password) }));
}

export async function update(
  id: number,
  input: Partial<{
    name: string;
    phone: string;
    area: string;
    username: string;
    password: string;
    active: boolean;
  }>,
) {
  const rider = await repo.findRider(id);
  if (!rider) throw notFound();
  if (input.username && (await repo.usernameTaken(input.username, id)))
    throw new HttpError(409, "This username is already taken.");
  if (input.phone && (await repo.phoneTaken(input.phone, id)))
    throw new HttpError(409, "This phone number is already used by another rider.");

  const { password, ...rest } = input;
  const data: Prisma.UserUpdateInput = { ...rest };
  if (password) data.passwordHash = await hashPassword(password);

  const updated = await inTransaction(async (tx) => {
    const u = await repo.updateRider(id, data, tx);
    // Deactivating a rider or changing their password signs them out everywhere.
    if (input.active === false || password) await repo.revokeAllSessions(id, tx);
    return u;
  });
  return riderDto(updated);
}

async function replacePhoto(userId: number, oldPath: string | null, buf: Buffer) {
  const name = await saveImage(buf);
  try {
    await repo.setPhoto(userId, name);
  } catch (e) {
    await removeImage(name);
    throw e;
  }
  await removeImage(oldPath);
  return name;
}

export async function setRiderPhoto(id: number, buf: Buffer) {
  const rider = await repo.findRider(id);
  if (!rider) throw notFound();
  await replacePhoto(id, rider.photoPath, buf);
  return riderDto(await repo.findRider(id).then((r) => r!));
}

export async function setOwnerPhoto(buf: Buffer) {
  const owner = await repo.findOwner();
  await replacePhoto(owner.id, owner.photoPath, buf);
  return ownerDto(await repo.findOwner());
}
