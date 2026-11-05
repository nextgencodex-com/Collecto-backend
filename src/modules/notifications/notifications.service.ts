import { notificationDto } from "../../utils/dto.js";
import * as repo from "./notifications.repository.js";

export async function list(userId: number, limit: number) {
  return (await repo.listForUser(userId, limit)).map(notificationDto);
}

export async function markAllRead(userId: number) {
  await repo.markAllRead(userId);
}
