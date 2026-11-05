// Performance check: loads a large synthetic dataset (2,000 customers, 5,000 items, ~46,000 payments) into the
// TEST database, times every heavy endpoint and prints key query plans, then restores the demo data.
//   npm run perf
// Refuses to run unless TEST_DATABASE_URL is set and differs from DATABASE_URL.
import "dotenv/config";
import { gzipSync } from "node:zlib";
if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL)
  throw new Error(
    "Set TEST_DATABASE_URL to a database different from DATABASE_URL (this script rewrites its data).",
  );
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_TODAY = "2026-10-13";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.UPLOADS_DIR = "./uploads-perf-tmp";
process.env.BOOTSTRAP_PAYMENT_DAYS ||= "90";

const request = (await import("supertest")).default;
const { createApp } = await import("../src/app.js");
const { prisma } = await import("../src/config/database.js");
const { seedDatabase } = await import("../src/db/seed.js");
const { runOverdueAlerts } = await import("../src/jobs/overdue.js");

const app = createApp();
{
  await seedDatabase(prisma, "2026-10-13", { avatarsDir: "missing" });
  const T = "DATE '2026-10-13'";
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Customer"(id,name,nic,phone,address,city,"riderId",lat,lng,notes,since)
    SELECT 1000+g, 'Cust '||g, 'N'||g, '077 000 '||lpad(g::text,4,'0'),'addr','Galle',(g%3)+1,6.8,79.9,'', ${T} - 150 FROM generate_series(1,2000) g`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Item"(id,"customerId","riderId",code,name,price,freq,amount,period,start)
    SELECT 1000+g, 1000+((g-1)%2000)+1, ((((g-1)%2000)+1)%3)+1, 'IR-101','Steam Iron',6400,'WEEKLY',400,4, ${T} - ((g*7)%140) FROM generate_series(1,5000) g`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Payment"(txn,"itemId","customerId","riderId",amount,date,time)
    SELECT 'TXS-'||i.id||'-'||n, i.id, i."customerId", i."riderId", 400, i.start + 7*n, '10:00'
    FROM "Item" i CROSS JOIN generate_series(0,15) n WHERE i.id > 1000 AND i.start + 7*n < ${T} - 1`);
  await prisma.$executeRawUnsafe(`ANALYZE`);
}
const n = await prisma.$queryRaw<
  { c: number; i: number; p: number }[]
>`SELECT (SELECT count(*)::int FROM "Customer") c,(SELECT count(*)::int FROM "Item") i,(SELECT count(*)::int FROM "Payment") p`;
console.log("dataset", n[0]);

const login = async (role: string, u: string, p: string) =>
  (await request(app).post("/api/v1/auth/login").send({ role, username: u, password: p })).body.data
    .accessToken as string;
const owner = await login("owner", "owner", "owner123");
const kasun = await login("rider", "kasun", "1234");

async function time(
  label: string,
  fn: () => Promise<{ status: number; text?: string; body?: unknown }>,
  runs = 3,
) {
  const times: number[] = [];
  let bytes = 0,
    status = 0,
    gz = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const r = await fn();
    times.push(performance.now() - t0);
    status = r.status;
    const s = r.text ?? JSON.stringify(r.body ?? "");
    bytes = s.length;
    if (i === 0) gz = gzipSync(s).length;
  }
  times.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(34)} ${String(status).padEnd(4)} median ${times[Math.floor(times.length / 2)]!.toFixed(0).padStart(5)} ms | ${(bytes / 1024).toFixed(0).padStart(6)} KB | gzip ${(gz / 1024).toFixed(0).padStart(5)} KB`,
  );
}
const get = (p: string, t: string) => () =>
  request(app).get(`/api/v1${p}`).set("Authorization", `Bearer ${t}`);

await time("GET /bootstrap (owner)", get("/bootstrap", owner));
await time("GET /bootstrap (rider R1)", get("/bootstrap", kasun));
await time("GET /customers?pageSize=50", get("/customers?pageSize=50", owner));
await time("GET /customers?q=Cust 12", get("/customers?q=Cust%2012", owner));
await time("GET /customers?status=OVERDUE", get("/customers?status=OVERDUE", owner));
await time("GET /customers?status=OVERDUE (R1)", get("/customers?status=OVERDUE", kasun));
await time("GET /payments?pageSize=50", get("/payments?pageSize=50", owner));
await time("GET /payments?date=…&rider", get("/payments?date=2026-10-12&riderId=R1", owner));
for (const t of ["daily", "monthly", "person", "item", "rider", "overdue"])
  await time(`GET /reports/${t}`, get(`/reports/${t}`, owner), 2);
await time("GET /audit", get("/audit", owner));
const t0 = performance.now();
const job = await runOverdueAlerts("2026-10-13");
console.log(
  `overdue job (${job.created} alerts)`.padEnd(34),
  "     ",
  `${(performance.now() - t0).toFixed(0)} ms`,
);

// writes
await time(
  "POST /closings (rider R1)",
  () =>
    request(app)
      .post("/api/v1/closings")
      .set("Authorization", `Bearer ${kasun}`)
      .send({ cash: 0, note: "profile" }),
  1,
);
let k = 0;
await time(
  "POST /payments (1 line)",
  () =>
    request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${kasun}`)
      .send({ customerId: "C102", lines: [{ itemId: "IT2", amount: 1 + (k++ % 5) * 0.01 }] }),
  3,
);

console.log("\n--- query plans");
const plan = async (label: string, sql: string) => {
  const rows = (
    await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF) ${sql}`,
    )
  ).map((r) => r["QUERY PLAN"]);
  const head = rows
    .filter((l) => /Scan|Aggregate|Sort|Join|Execution Time/.test(l))
    .slice(0, 6)
    .map((l) => "   " + l.trim());
  console.log(label + "\n" + head.join("\n"));
};
await plan(
  "payments since window (owner)",
  `SELECT * FROM "Payment" WHERE date >= DATE '2026-07-15'`,
);
await plan(
  "prior paid groupBy (owner)",
  `SELECT "itemId", SUM(amount) FROM "Payment" WHERE date < DATE '2026-07-15' GROUP BY "itemId"`,
);
await plan(
  "rider scope payments",
  `SELECT * FROM "Payment" p WHERE p."riderId" = 1 OR p."customerId" IN (SELECT id FROM "Customer" WHERE "riderId" = 1)`,
);
await plan(
  "daily payments by rider/date",
  `SELECT * FROM "Payment" WHERE date = DATE '2026-10-12' AND "riderId" = 1`,
);
await plan("payments of one item", `SELECT * FROM "Payment" WHERE "itemId" = 1500`);
await plan(
  "closing lookup",
  `SELECT * FROM "Closing" WHERE "riderId" = 1 AND date = DATE '2026-10-13'`,
);

await seedDatabase(prisma, "2026-10-13", { avatarsDir: "missing" }); // leave the test database clean
await prisma.$disconnect();
process.exit(0);
