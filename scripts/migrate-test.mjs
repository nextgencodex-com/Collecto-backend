// Applies migrations to the TEST database (TEST_DATABASE_URL).
import "dotenv/config";
import { spawnSync } from "node:child_process";

const test = process.env.TEST_DATABASE_URL;
if (!test) throw new Error("TEST_DATABASE_URL is not set");
if (test === process.env.DATABASE_URL)
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");

const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: test },
});
process.exit(r.status ?? 1);
