// Demo data: a port of the frontend's buildSeed() (Collecto-frontend/src/lib/seed.ts).
// The prototype's dates are anchored on 2026-10-13; every date here is shifted so the demo
// is "as of" the current day (or APP_TODAY), keeping the same overdue/due/paid situations.
// DEV ONLY: truncates every table. Refuses to run with NODE_ENV=production.
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { env } from "../src/config/env.js";
import { prisma as defaultPrisma } from "../src/config/database.js";
import {
  addDays,
  cumulativePaise,
  daysBetween,
  fromPaise,
  schedule,
  type Freq,
} from "../src/domain/schedule.js";
import { toDbDate, today as todayFn } from "../src/utils/dates.js";
import { hashPassword } from "../src/utils/password.js";

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

/** Copies the frontend's demo avatars into UPLOADS_DIR under random names; returns the stored name. */
function importAvatar(file: string): string | null {
  const src = path.resolve("..", "Collecto-frontend", "public", "images", "avatars", file);
  if (!existsSync(src)) return null;
  mkdirSync(env.UPLOADS_DIR, { recursive: true });
  const name = `${randomUUID()}.jpg`;
  copyFileSync(src, path.join(env.UPLOADS_DIR, name));
  return name;
}

export async function seedDatabase(prisma: Db = defaultPrisma, today: string = todayFn()) {
  if (env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const shift = daysBetween(DEMO_BASE, today);
  const sh = (d: string) => addDays(d, shift);
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
    1: importAvatar("rider-1.jpg"),
    2: importAvatar("rider-2.jpg"),
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
  const owner = await prisma.user.create({
    data: {
      id: 4,
      role: "OWNER",
      username: "owner",
      email: "owner@collecto.lk",
      name: "Shop Owner",
      passwordHash: ownerHash,
      photoPath: importAvatar("owner.jpg"),
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

  // Customer "since" = day before their earliest item starts
  const firstStart = (ci: number) =>
    SPEC.filter((s) => s[0] === ci)
      .map((s) => sh(s[2]))
      .sort()[0];
  for (const [i, [name, nic, phone, address, city, riderId, dl, dg]] of CUSTOMERS.entries()) {
    const [lat, lng] = AREAS[city]!;
    const start = firstStart(i);
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
        photoPath: importAvatar(`customer-${101 + i}.jpg`),
        since: toDbDate(start ? addDays(start, -1) : today),
      },
    });
  }

  const items = [] as {
    id: number;
    customerId: number;
    riderId: number;
    plan: { price: number; amount: number; freq: Freq; start: string };
    unpaid: number;
    paidToday: number;
  }[];
  for (const [k, [ci, code, start, unpaid, paidToday]] of SPEC.entries()) {
    const p = PRODUCTS.find((x) => x[0] === code)!;
    const c = CUSTOMERS[ci]!;
    const item = { id: k + 1, customerId: 101 + ci, riderId: c[5] };
    const plan = { price: p[4], amount: p[6], freq: p[5] as Freq, start: sh(start) };
    await prisma.item.create({
      data: {
        ...item,
        code,
        name: p[1],
        price: plan.price,
        freq: plan.freq,
        amount: plan.amount,
        period: p[7],
        start: toDbDate(plan.start),
      },
    });
    items.push({ ...item, plan, unpaid, paidToday });
  }

  // Payments: everything due before today is paid except the last `unpaid` instalments
  const pays: {
    itemId: number;
    customerId: number;
    riderId: number;
    paise: number;
    date: string;
    time: string;
  }[] = [];
  items.forEach((it, k) => {
    const ds = schedule(it.plan);
    const cum = cumulativePaise(it.plan);
    const amt = (i: number) => cum(i) - (i ? cum(i - 1) : 0);
    const before = ds.filter((d) => d < today);
    for (let i = 0; i < before.length - it.unpaid; i++)
      pays.push({
        itemId: it.id,
        customerId: it.customerId,
        riderId: it.riderId,
        paise: amt(i),
        date: before[i]!,
        time: pad(9 + ((i * 3 + k) % 8)) + ":" + pad((i * 17 + k * 11) % 60),
      });
    const ti = ds.indexOf(today);
    if (it.paidToday && ti >= 0)
      pays.push({
        itemId: it.id,
        customerId: it.customerId,
        riderId: it.riderId,
        paise: amt(ti),
        date: today,
        time: "09:" + pad(12 + k * 2),
      });
  });
  pays.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const corrected = pays.find((p) => p.itemId === 9 && p.date === sh("2026-09-15"));
  await prisma.payment.createMany({
    data: pays.map((p, i) => ({
      id: i + 1,
      txn: txnId(p.date, i + 1),
      itemId: p.itemId,
      customerId: p.customerId,
      riderId: p.riderId,
      amount: money(p.paise),
      date: toDbDate(p.date),
      time: p.time,
      status: p === corrected ? ("CORRECTED" as const) : ("COMPLETED" as const),
    })),
  });

  if (corrected) {
    const name = CUSTOMERS[7]![0];
    await prisma.auditEntry.create({
      data: {
        at: new Date(`${corrected.date}T18:40:00+05:30`),
        userId: owner.id,
        action: "Payment amount corrected",
        txn: txnId(corrected.date, pays.indexOf(corrected) + 1),
        ref: name,
        old: rs(corrected.paise * 10),
        nw: rs(corrected.paise),
        reason: "Rider entered an extra zero. Verified against the customer receipt.",
      },
    });
  }

  const todays = pays.map((p, i) => ({ p, i })).filter(({ p }) => p.date === today);
  await prisma.notification.createMany({
    data: todays.map(({ p }, n) => ({
      id: n + 1,
      userId: owner.id,
      type: "PAYMENT" as const,
      title: "Payment received",
      text: `${rs(p.paise)} from ${CUSTOMERS[p.customerId - 101]![0]} · ${RIDERS[p.riderId - 1]![1]}`,
      at: new Date(`${p.date}T${p.time}:00+05:30`),
    })),
  });

  // Keep identity sequences ahead of the explicitly inserted ids.
  for (const t of ["User", "Customer", "Item", "Payment", "Notification"])
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${t}"','id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1))`,
    );

  return { payments: pays.length, items: items.length, customers: CUSTOMERS.length, today };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDatabase()
    .then((r) => console.log("Seeded:", r))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => defaultPrisma.$disconnect());
}
