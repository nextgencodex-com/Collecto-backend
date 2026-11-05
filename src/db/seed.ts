// Demo data: a port of the frontend prototype's buildSeed() (Collecto-frontend/src/lib/seed.ts, now removed).
//
// The prototype is anchored on 2026-10-13. To make the demo "as of" any other day we do not just shift
// every date (that breaks monthly plans, whose due day-of-month matters); instead each plan is re-anchored
// so it is in the same *situation* relative to today as in the prototype: the same number of instalments
// elapsed and the same number of days since the last one fell due. That keeps the prototype's pattern
// (who is overdue, due today, paid today, up to date, upcoming) on any date.
//
// DEV ONLY: seedDatabase() truncates every table. Refuses to run with NODE_ENV=production.
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma as defaultPrisma } from "../config/database.js";
import { env } from "../config/env.js";
import {
  addDays,
  addMonths,
  cumulativePaise,
  daysBetween,
  fromPaise,
  schedule,
  type Freq,
} from "../domain/schedule.js";
import { atLocal, toDbDate, today as todayFn } from "../utils/dates.js";
import { hashPassword } from "../utils/password.js";

type Db = typeof defaultPrisma;

const DEMO_BASE = "2026-10-13";
const money = (paise: number) => fromPaise(paise).toFixed(2);
const rs = (paise: number) =>
  "Rs. " + fromPaise(paise).toLocaleString("en-US", { minimumFractionDigits: 2 });
const pad = (n: number) => String(n).padStart(2, "0");
const txnId = (date: string, seq: number) =>
  "TX" + date.replace(/-/g, "").slice(2) + "-" + String(seq).padStart(4, "0");

const RIDERS = [
  [1, "Kasun Perera", "077 245 8812", "Maharagama, Nugegoda", "kasun"],
  [2, "Nimal Silva", "071 903 4471", "Kottawa, Homagama", "nimal"],
  [3, "Tharindu Jayasinghe", "076 118 2290", "Piliyandala", "tharindu"],
] as const;

// code, name, purchase, cash, price, freq, amount, period, stock
const PRODUCTS = [
  ["IR-101", "Steam Iron", 3900, 5200, 6400, "WEEKLY", 400, 4, 14],
  ["FN-160", "Pedestal Fan", 5800, 7900, 9600, "WEEKLY", 600, 4, 9],
  ["BL-300", "Blender 3-Jar", 4700, 6500, 8000, "WEEKLY", 500, 4, 11],
  ["RC-220", "Rice Cooker 2.2L", 7200, 9800, 12000, "WEEKLY", 500, 6, 8],
  ["GC-200", "Gas Cooker 2-Burner", 14500, 19500, 24000, "WEEKLY", 1000, 6, 6],
  ["PH-A15", "Smartphone A15", 31000, 39500, 48000, "MONTHLY", 4000, 12, 5],
  ["TV-320", '32" LED TV', 46000, 59000, 72000, "MONTHLY", 6000, 12, 4],
  ["WM-700", "Washing Machine 7kg", 62000, 79000, 96000, "MONTHLY", 8000, 12, 3],
  ["FR-250", "Refrigerator 250L", 78000, 99000, 120000, "MONTHLY", 10000, 12, 2],
] as const;

const AREAS: Record<string, [number, number]> = {
  Maharagama: [6.848, 79.9265],
  Nugegoda: [6.872, 79.889],
  Kottawa: [6.841, 79.965],
  Homagama: [6.844, 80.003],
  Piliyandala: [6.801, 79.922],
};

// name, nic, phone, address, city, riderId, dLat, dLng
const CUSTOMERS = [
  [
    "Saman Kumara",
    "198812304567",
    "077 512 3344",
    "No. 14, Temple Road",
    "Maharagama",
    1,
    0.004,
    -0.003,
  ],
  [
    "Dilani Fernando",
    "917654321V",
    "071 667 2108",
    "22/3, Old Kesbewa Road",
    "Maharagama",
    1,
    -0.005,
    0.004,
  ],
  [
    "Ruwan Bandara",
    "199203118842",
    "075 334 9021",
    "8, Stanley Thilakaratne Mw",
    "Nugegoda",
    1,
    0.003,
    0.005,
  ],
  [
    "Chamari Wijesinghe",
    "886540127V",
    "072 880 4513",
    "41, Pagoda Road",
    "Nugegoda",
    1,
    -0.004,
    -0.004,
  ],
  [
    "Pradeep Rathnayake",
    "199507602231",
    "078 221 6650",
    "5A, High Level Road",
    "Maharagama",
    1,
    0.001,
    0.009,
  ],
  [
    "Sunil Abeywickrama",
    "197011209876",
    "070 455 1902",
    "17, Jambugasmulla Road",
    "Nugegoda",
    1,
    0.008,
    0.001,
  ],
  [
    "Nadeesha Gunawardena",
    "199661903345",
    "077 908 2231",
    "63, Hokandara Road",
    "Kottawa",
    2,
    0.003,
    -0.002,
  ],
  [
    "Asanka Herath",
    "893120558V",
    "071 225 7789",
    "12, Makumbura Road",
    "Kottawa",
    2,
    -0.004,
    0.004,
  ],
  [
    "Malini Senanayake",
    "197562004413",
    "076 340 5512",
    "9, Godagama Road",
    "Homagama",
    2,
    0.004,
    0.002,
  ],
  [
    "Kumudu Dissanayake",
    "199870112906",
    "075 667 0981",
    "28, Pitipana Road",
    "Homagama",
    2,
    -0.003,
    -0.005,
  ],
  [
    "Lahiru Madushanka",
    "200012503378",
    "078 773 4410",
    "3, Kesbewa Road",
    "Piliyandala",
    3,
    0.003,
    0.003,
  ],
  [
    "Ishara Peris",
    "945230776V",
    "072 119 6684",
    "51, Moratuwa Road",
    "Piliyandala",
    3,
    -0.004,
    -0.002,
  ],
] as const;

// customerIndex, productCode, start (prototype date), unpaidBeforeToday, paidToday
const SPEC: [number, string, string, number, number][] = [
  [0, "IR-101", "2026-08-18", 0, 0],
  [1, "TV-320", "2026-05-13", 0, 0],
  [1, "FN-160", "2026-09-01", 1, 0],
  [2, "GC-200", "2026-07-07", 0, 1],
  [3, "PH-A15", "2026-03-05", 2, 0],
  [4, "BL-300", "2026-08-20", 0, 0],
  [5, "RC-220", "2026-09-29", 1, 0],
  [6, "FR-250", "2026-02-13", 0, 1],
  [7, "IR-101", "2026-07-14", 3, 0],
  [8, "WM-700", "2026-04-20", 0, 0],
  [9, "RC-220", "2026-09-15", 0, 0],
  [10, "FN-160", "2026-06-02", 0, 0],
  [10, "TV-320", "2026-10-20", 0, 0],
  [11, "GC-200", "2026-08-11", 0, 1],
  [4, "IR-101", "2026-01-06", 0, 0],
];

/**
 * Start date that puts a plan in the same situation on `today` as the prototype plan was on DEMO_BASE:
 * same number of instalments already due, and the last of them fell due the same number of days ago.
 * Plans that had not started yet keep the same distance into the future.
 */
export function anchoredStart(
  plan: { price: number; amount: number; freq: Freq; start: string },
  today: string,
): string {
  const dates = schedule(plan);
  const elapsed = dates.filter((d) => d <= DEMO_BASE).length;
  if (elapsed === 0) return addDays(today, daysBetween(DEMO_BASE, plan.start));
  const daysSinceLastDue = daysBetween(dates[elapsed - 1]!, DEMO_BASE);
  const lastDue = addDays(today, -daysSinceLastDue);
  if (plan.freq === "WEEKLY") return addDays(lastDue, -7 * (elapsed - 1));

  // Monthly: the due day-of-month is that of `lastDue`. Walk back `elapsed - 1` months to a month that
  // actually has that day (e.g. never "31 April"), otherwise the clamped date would drift off the pattern.
  const day = Number(lastDue.slice(8));
  let back = elapsed - 1;
  for (;;) {
    const first = addMonths(lastDue.slice(0, 8) + "01", -back);
    const monthDays = Number(addDays(addMonths(first, 1), -1).slice(8));
    if (day <= monthDays) return first.slice(0, 8) + pad(day);
    back++;
  }
}

export interface DemoItem {
  id: number;
  customerId: number;
  riderId: number;
  code: string;
  name: string;
  price: number;
  freq: Freq;
  amount: number;
  period: number;
  start: string;
}
export interface DemoPayment {
  id: number;
  txn: string;
  itemId: number;
  customerId: number;
  riderId: number;
  paise: number;
  date: string;
  time: string;
  corrected: boolean;
}

/** The demo ledger as plain data for a given "today" (no database): items, payments, customer-since dates. */
export function buildDemo(today: string) {
  const items: DemoItem[] = SPEC.map(([ci, code, start0], k) => {
    const p = PRODUCTS.find((x) => x[0] === code)!;
    const plan = { price: p[4], amount: p[6], freq: p[5] as Freq, start: start0 };
    return {
      id: k + 1,
      customerId: 101 + ci,
      riderId: CUSTOMERS[ci]![5],
      code,
      name: p[1],
      price: p[4],
      freq: p[5] as Freq,
      amount: p[6],
      period: p[7],
      start: anchoredStart(plan, today),
    };
  });

  // Everything due before today is paid except the last `unpaid` instalments; some are also paid today.
  const raw: Omit<DemoPayment, "id" | "txn" | "corrected">[] = [];
  items.forEach((it, k) => {
    const [, , , unpaid, paidToday] = SPEC[k]!;
    const ds = schedule(it);
    const cum = cumulativePaise(it);
    const amt = (i: number) => cum(i) - (i ? cum(i - 1) : 0);
    const before = ds.filter((d) => d < today);
    for (let i = 0; i < before.length - unpaid; i++)
      raw.push({
        itemId: it.id,
        customerId: it.customerId,
        riderId: it.riderId,
        paise: amt(i),
        date: before[i]!,
        time: pad(9 + ((i * 3 + k) % 8)) + ":" + pad((i * 17 + k * 11) % 60),
      });
    const ti = ds.indexOf(today);
    if (paidToday && ti >= 0)
      raw.push({
        itemId: it.id,
        customerId: it.customerId,
        riderId: it.riderId,
        paise: amt(ti),
        date: today,
        time: "09:" + pad(12 + k * 2),
      });
  });
  raw.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  // One historical correction (item 9, its first-but-older payment), as in the prototype's audit log.
  const correctedAt = addDays(today, -28);
  const payments: DemoPayment[] = raw.map((p, i) => ({
    ...p,
    id: i + 1,
    txn: txnId(p.date, i + 1),
    corrected: false,
  }));
  // the latest payment of item 9 dated 28 days ago or earlier (2026-09-15 in the prototype)
  const corrected =
    [...payments].reverse().find((p) => p.itemId === 9 && p.date <= correctedAt) ??
    payments.find((p) => p.itemId === 9);
  if (corrected) corrected.corrected = true;

  const since = (ci: number) => {
    const starts = items
      .filter((i) => i.customerId === 101 + ci)
      .map((i) => i.start)
      .sort();
    return starts[0] ? addDays(starts[0], -1) : today;
  };
  return { items, payments, corrected: corrected ?? null, since };
}

/** Copies the frontend's demo avatars into UPLOADS_DIR under random names; returns the stored name. */
function importAvatar(dir: string, file: string): string | null {
  const src = path.join(dir, file);
  if (!existsSync(src)) return null;
  mkdirSync(env.UPLOADS_DIR, { recursive: true });
  const name = `${randomUUID()}.jpg`;
  copyFileSync(src, path.join(env.UPLOADS_DIR, name));
  return name;
}

export async function seedDatabase(
  prisma: Db = defaultPrisma,
  today: string = todayFn(),
  opts: { avatarsDir?: string } = {},
) {
  if (env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const avatars =
    opts.avatarsDir ?? path.resolve("..", "Collecto-frontend", "public", "images", "avatars");
  const demo = buildDemo(today);
  const [ownerHash, riderHash] = await Promise.all([
    hashPassword("owner123"),
    hashPassword("1234"),
  ]);

  await prisma.$executeRawUnsafe(
    `TRUNCATE "RefreshToken","Notification","AuditEntry","Closing","Extension","Payment","Item","Customer","Product","Shop","User" RESTART IDENTITY CASCADE`,
  );

  await prisma.shop.create({
    data: {
      id: 1,
      name: "COLLECTO Demo Shop",
      phone: "011 285 4410",
      address: "112, High Level Road, Maharagama",
    },
  });

  const riderPhotos: Record<number, string | null> = {
    1: importAvatar(avatars, "rider-1.jpg"),
    2: importAvatar(avatars, "rider-2.jpg"),
    3: null,
  };
  for (const [id, name, phone, area, username] of RIDERS) {
    await prisma.user.create({
      data: {
        id,
        role: "RIDER",
        username,
        name,
        phone,
        area,
        passwordHash: riderHash,
        photoPath: riderPhotos[id] ?? null,
      },
    });
  }
  // The owner is always id 0 (riders are 1..n), enforced by a CHECK constraint.
  const owner = await prisma.user.create({
    data: {
      id: 0,
      role: "OWNER",
      username: "owner",
      email: "owner@collecto.lk",
      name: "Shop Owner",
      passwordHash: ownerHash,
      photoPath: importAvatar(avatars, "owner.jpg"),
    },
  });

  const sold: Record<string, number> = {};
  SPEC.forEach(([, code]) => (sold[code] = (sold[code] ?? 0) + 1));
  for (const [code, name, purchase, cash, price, freq, amount, period, stock] of PRODUCTS) {
    await prisma.product.create({
      data: {
        code,
        name,
        purchase,
        cash,
        price,
        freq,
        amount,
        period,
        stock,
        sold: sold[code] ?? 0,
      },
    });
  }

  for (const [i, [name, nic, phone, address, city, riderId, dl, dg]] of CUSTOMERS.entries()) {
    const [lat, lng] = AREAS[city]!;
    await prisma.customer.create({
      data: {
        id: 101 + i,
        name,
        nic,
        phone,
        address,
        city,
        riderId,
        lat: +(lat + dl).toFixed(5),
        lng: +(lng + dg).toFixed(5),
        photoPath: importAvatar(avatars, `customer-${101 + i}.jpg`),
        since: toDbDate(demo.since(i)),
      },
    });
  }

  for (const it of demo.items)
    await prisma.item.create({
      data: {
        id: it.id,
        customerId: it.customerId,
        riderId: it.riderId,
        code: it.code,
        name: it.name,
        price: it.price,
        freq: it.freq,
        amount: it.amount,
        period: it.period,
        start: toDbDate(it.start),
      },
    });

  await prisma.payment.createMany({
    data: demo.payments.map((p) => ({
      id: p.id,
      txn: p.txn,
      itemId: p.itemId,
      customerId: p.customerId,
      riderId: p.riderId,
      amount: money(p.paise),
      date: toDbDate(p.date),
      time: p.time,
      status: p.corrected ? ("CORRECTED" as const) : ("COMPLETED" as const),
    })),
  });

  const c = demo.corrected;
  if (c) {
    await prisma.auditEntry.create({
      data: {
        at: atLocal(c.date, "18:40"),
        userId: owner.id,
        action: "Payment amount corrected",
        txn: c.txn,
        ref: CUSTOMERS[7]![0],
        old: rs(c.paise * 10),
        nw: rs(c.paise),
        reason: "Rider entered an extra zero. Verified against the customer receipt.",
      },
    });
  }

  const todays = demo.payments.filter((p) => p.date === today);
  await prisma.notification.createMany({
    data: todays.map((p, n) => ({
      id: n + 1,
      userId: owner.id,
      type: "PAYMENT" as const,
      title: "Payment received",
      text: `${rs(p.paise)} from ${CUSTOMERS[p.customerId - 101]![0]} · ${RIDERS[p.riderId - 1]![1]}`,
      at: atLocal(p.date, p.time),
    })),
  });

  // Keep identity sequences ahead of the explicitly inserted ids (rider ids themselves are max+1).
  for (const t of ["Customer", "Item", "Payment", "Notification"])
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${t}"','id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1))`,
    );

  return {
    payments: demo.payments.length,
    items: demo.items.length,
    customers: CUSTOMERS.length,
    today,
  };
}
