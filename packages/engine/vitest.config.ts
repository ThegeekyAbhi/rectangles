import { defineConfig } from "vitest/config";

/**
 * Two projects so everyday runs stay fast:
 * - `fast`: unit and behaviour tests (`pnpm test`).
 * - `slow`: long statistical runs checked against queueing theory, named `*.slow.test.ts`
 *   (`pnpm test:slow`). Run them before committing engine changes.
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: "fast", include: ["tests/**/*.test.ts"], exclude: ["tests/**/*.slow.test.ts"] },
      },
      {
        extends: true,
        // Each long run takes seconds; they are checked against theory, not timed.
        test: { name: "slow", include: ["tests/**/*.slow.test.ts"], testTimeout: 30_000 },
      },
    ],
  },
});
