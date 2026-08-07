import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/**"],
      // Entry point: env parsing + transport wiring, exercised by scripts/e2e-live.mjs.
      exclude: ["src/index.ts"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
