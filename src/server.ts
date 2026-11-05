import { createApp } from "./app.js";
import { prisma } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { startOverdueJob } from "./jobs/overdue.js";

const server = createApp().listen(env.PORT, () =>
  logger.info(`Collecto API listening on :${env.PORT}`),
);

const overdueJob = startOverdueJob();

let closing = false;
function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info(`${signal} received, shutting down`);
  void overdueJob?.stop();
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => {
    void prisma.$disconnect().finally(() => {
      logger.info("shutdown complete");
      process.exit(0);
    });
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => logger.error({ err }, "unhandledRejection"));
