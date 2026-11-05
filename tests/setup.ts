// Test env: must be set before any module imports src/config/env.ts.
import "dotenv/config";
import { tmpdir } from "node:os";
import path from "node:path";

const devUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;

// Never let tests point at the dev database: they truncate tables.
if (testUrl && testUrl === devUrl) {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testUrl ?? "postgresql://test:test@localhost:5432/collecto_test";
process.env.JWT_ACCESS_SECRET ||= "test-secret-test-secret-test-secret-123";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.LOG_LEVEL = "silent";
process.env.UPLOADS_DIR = path.join(tmpdir(), "collecto-test-uploads");
process.env.APP_TODAY = "2026-10-13";
// Most tests want the whole payment history in /bootstrap; the window has its own tests.
process.env.BOOTSTRAP_PAYMENT_DAYS = "0";
