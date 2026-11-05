// Database rows -> the JSON shapes the frontend already uses (src/lib/types.ts):
// prefixed string ids, lowercase enums, money as numbers, dates as YYYY-MM-DD, photos as URLs.
import type {
  AuditEntry,
  Closing,
  Customer,
  Extension,
  Item,
  Notification,
  Payment,
  Product,
  Shop,
  User,
} from "../generated/prisma/client.js";
import { dayOf, isoDate, timeOf } from "./dates.js";
import { customerId, itemId, paymentId, riderId } from "./ids.js";
import { num } from "./money.js";
import { photoUrl } from "./uploads.js";

const lower = <T extends string>(s: T) => s.toLowerCase() as Lowercase<T>;

export const shopDto = (s: Shop) => ({ name: s.name, phone: s.phone, address: s.address });

export const ownerDto = (u: User) => ({
  name: u.name,
  email: u.email,
  username: u.username,
  photo: photoUrl(u.photoPath),
});

export const riderDto = (u: User) => ({
  id: riderId.format(u.id),
  name: u.name,
  phone: u.phone,
  area: u.area,
  username: u.username,
  active: u.active,
  photo: photoUrl(u.photoPath),
});

export const productDto = (p: Product) => ({
  code: p.code,
  name: p.name,
  purchase: num(p.purchase),
  cash: num(p.cash),
  price: num(p.price),
  freq: lower(p.freq),
  amount: num(p.amount),
  period: p.period,
  stock: p.stock,
  sold: p.sold,
});

export const customerDto = (c: Customer) => ({
  id: customerId.format(c.id),
  name: c.name,
  nic: c.nic,
  phone: c.phone,
  address: c.address,
  city: c.city,
  riderId: riderId.format(c.riderId),
  lat: c.lat,
  lng: c.lng,
  notes: c.notes,
  photo: photoUrl(c.photoPath),
  since: isoDate(c.since),
});

export const itemDto = (i: Item) => ({
  id: itemId.format(i.id),
  customerId: customerId.format(i.customerId),
  riderId: riderId.format(i.riderId),
  code: i.code,
  name: i.name,
  price: num(i.price),
  freq: lower(i.freq),
  amount: num(i.amount),
  period: i.period,
  start: isoDate(i.start),
});

export const paymentDto = (p: Payment) => ({
  id: paymentId.format(p.id),
  txn: p.txn,
  itemId: itemId.format(p.itemId),
  customerId: customerId.format(p.customerId),
  riderId: riderId.format(p.riderId),
  amount: num(p.amount),
  date: isoDate(p.date),
  time: p.time,
  status: lower(p.status),
});

export const auditDto = (a: AuditEntry & { user: { name: string } | null }) => ({
  id: `A${a.id}`,
  date: dayOf(a.at),
  time: timeOf(a.at),
  user: a.user?.name ?? "System",
  action: a.action,
  txn: a.txn,
  ref: a.ref,
  old: a.old,
  nw: a.nw,
  reason: a.reason,
});

export const notificationDto = (n: Notification) => ({
  id: `N${n.id}`,
  type: lower(n.type),
  title: n.title,
  text: n.text,
  date: dayOf(n.at),
  time: timeOf(n.at),
  read: n.read,
});

export const closingDto = (c: Closing) => ({
  id: `CL${c.id}`,
  riderId: riderId.format(c.riderId),
  date: isoDate(c.date),
  time: c.time,
  expected: num(c.expected),
  collected: num(c.collected),
  pending: num(c.pending),
  cash: num(c.cash),
  count: c.count,
  note: c.note,
});

export const extensionDto = (e: Extension) => ({
  id: `E${e.id}`,
  customerId: customerId.format(e.customerId),
  riderId: riderId.format(e.riderId),
  date: isoDate(e.date),
  time: e.time,
  until: isoDate(e.until),
  reason: e.reason,
});
