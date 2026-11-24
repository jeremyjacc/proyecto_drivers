import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    // Las pruebas de integración comparten una misma base PostgreSQL aislada:
    // se ejecutan archivo por archivo para evitar interferencias.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
