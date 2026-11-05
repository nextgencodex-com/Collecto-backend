import "dotenv/config";
import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool.default(false),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: bool.default(false),
  APP_TZ: z.string().default("Asia/Colombo"),
  APP_TODAY: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  UPLOADS_DIR: z.string().default("./uploads"),
  UPLOADS_PUBLIC_URL: z.string().default("http://localhost:4000/uploads"),
  OVERDUE_ALERTS_ENABLED: bool.default(true),
  OVERDUE_CRON: z.string().default("0 8 * * *"),
});

// Empty strings (as left in .env.example) count as unset so defaults apply.
export const parseEnv = (raw: Record<string, string | undefined>) =>
  schema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== "")));

const parsed = parseEnv(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const i of parsed.error.issues) console.error(`  ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}
export const env = parsed.data;
