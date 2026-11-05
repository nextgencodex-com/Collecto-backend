import cron from "node-cron";
import { inTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { deriveAll } from "../domain/adapters.js";
import { loadCore } from "../modules/bootstrap/bootstrap.repository.js";
import * as notifications from "../modules/notifications/notifications.repository.js";
import { today } from "../utils/dates.js";
import { customerId } from "../utils/ids.js";
import { fmtRs } from "../utils/money.js";

const LOCK_KEY = 727_001; // arbitrary app-wide advisory-lock id for this job

/**
 * Creates one OVERDUE notification per customer with overdue instalments, once per day.
 * Idempotent (dedupeKey) and safe with several app instances (transaction-level advisory lock).
 */
export async function runOverdueAlerts(date = today()) {
  return inTransaction(async (tx) => {
    const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
    if (!lock?.locked) return { created: 0, skipped: true };

    const { customers, items, payments } = await loadCore(undefined, tx);
    const d = deriveAll(
      items,
      payments,
      customers.map((c) => c.id),
      date,
    );
    const rows = customers.flatMap((c) => {
      const a = d.customers.get(c.id)!;
      return a.overdue > 0
        ? [
            {
              type: "OVERDUE" as const,
              title: "Overdue alert",
              text: `${c.name} has ${fmtRs(a.overdue)} overdue (${a.missed} missed)`,
              dedupeKey: `overdue:${customerId.format(c.id)}:${date}`,
            },
          ]
        : [];
    });
    return { created: await notifications.createManyForOwner(rows, tx), skipped: false };
  });
}

export function startOverdueJob() {
  if (!env.OVERDUE_ALERTS_ENABLED || env.NODE_ENV === "test") return null;
  if (!cron.validate(env.OVERDUE_CRON)) {
    logger.error({ cron: env.OVERDUE_CRON }, "Invalid OVERDUE_CRON; overdue alerts disabled");
    return null;
  }
  const task = cron.schedule(
    env.OVERDUE_CRON,
    () => {
      runOverdueAlerts()
        .then((r) => logger.info(r, "overdue alerts run"))
        .catch((err) => logger.error({ err }, "overdue alerts failed"));
    },
    { timezone: env.APP_TZ },
  );
  logger.info({ cron: env.OVERDUE_CRON, tz: env.APP_TZ }, "overdue alert job scheduled");
  return task;
}
