// CLI entry for `npm run db:seed`. The seed itself lives in src/db/seed.ts so the app can reuse it.
import { prisma } from "../src/config/database.js";
import { seedDatabase } from "../src/db/seed.js";

seedDatabase()
  .then((r) => console.log("Seeded:", r))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
