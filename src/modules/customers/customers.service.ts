import { inTransaction } from "../../config/database.js";
import type { AuthUser } from "../../types/express.js";
import { addDays } from "../../domain/schedule.js";
import { fd, nowHHmm, toDbDate, today } from "../../utils/dates.js";
import { customerDto, extensionDto, itemDto } from "../../utils/dto.js";
import { HttpError } from "../../utils/http.js";
import { removeImage, saveImage } from "../../utils/uploads.js";
import * as items from "../items/items.repository.js";
import * as notifications from "../notifications/notifications.repository.js";
import * as riders from "../riders/riders.repository.js";
import * as repo from "./customers.repository.js";

const notFound = () => new HttpError(404, "Customer not found.");
const scope = (u: AuthUser) => (u.role === "RIDER" ? u.id : undefined);

async function activeRider(id: number) {
  const r = await riders.findRider(id);
  if (!r) throw new HttpError(422, "Assign a rider.");
  if (!r.active) throw new HttpError(422, "This rider account is inactive.");
  return r;
}

export async function create(i: {
  name: string;
  nic: string;
  phone: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  riderId: number;
  notes: string;
}) {
  if (await repo.nicExists(i.nic))
    throw new HttpError(409, "A customer with this NIC is already registered.");
  await activeRider(i.riderId);
  const c = await repo.create({
    ...i,
    lat: +i.lat.toFixed(5),
    lng: +i.lng.toFixed(5),
    since: toDbDate(today()),
  });
  return customerDto(c);
}

export async function list(
  user: AuthUser,
  f: { q?: string; riderId?: number; page: number; pageSize: number },
) {
  const { rows, total } = await repo.list({
    q: f.q,
    riderId: scope(user) ?? f.riderId,
    skip: (f.page - 1) * f.pageSize,
    take: f.pageSize,
  });
  return { rows: rows.map(customerDto), total };
}

export async function get(user: AuthUser, id: number) {
  const c = await repo.findById(id, scope(user));
  if (!c) throw notFound();
  return { customer: customerDto(c), items: (await items.listByCustomer(id)).map(itemDto) };
}

/** Moves the customer and all of their items to another rider. */
export async function assignRider(id: number, riderId: number) {
  if (!(await repo.findById(id))) throw notFound();
  await activeRider(riderId);
  return customerDto(await inTransaction((tx) => repo.reassign(id, riderId, tx)));
}

export async function addExtension(
  user: AuthUser,
  id: number,
  i: { until: string; reason: string },
) {
  const c = await repo.findById(id, user.id); // a rider can only extend their own customers
  if (!c) throw notFound();
  const t = today();
  if (i.until <= t) throw new HttpError(422, "Choose a date after today.");
  if (i.until > addDays(t, 30)) throw new HttpError(422, "An extension can be at most 30 days.");

  const ext = await inTransaction(async (tx) => {
    const e = await repo.createExtension(
      {
        customerId: id,
        riderId: user.id,
        date: toDbDate(t),
        time: nowHHmm(),
        until: toDbDate(i.until),
        reason: i.reason,
      },
      tx,
    );
    await notifications.createForOwner(
      {
        type: "SYSTEM",
        title: "Payment extended",
        text: `${c.name} promised to pay on ${fd(i.until)} · ${user.name}: ${i.reason}`,
      },
      tx,
    );
    return e;
  });
  return extensionDto(ext);
}

export async function setPhoto(id: number, buf: Buffer) {
  const c = await repo.findById(id);
  if (!c) throw notFound();
  const name = await saveImage(buf);
  let updated;
  try {
    updated = await repo.setPhoto(id, name);
  } catch (e) {
    await removeImage(name);
    throw e;
  }
  await removeImage(c.photoPath);
  return customerDto(updated);
}
