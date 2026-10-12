import { defineConfig } from "vitest/config";

// Database tests run migrations against a real PostgreSQL instance
// (see scripts/db-test.sh). They are kept separate from fast unit tests.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
