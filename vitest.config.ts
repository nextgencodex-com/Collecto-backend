import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // Integration suites share one test database (they truncate/seed it), so run files serially.
    fileParallelism: false,
  },
});
