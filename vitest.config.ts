import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@venix/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@venix/database": path.resolve(__dirname, "packages/database/src/index.ts"),
      "@venix/sharing/clip": path.resolve(__dirname, "packages/sharing/src/clip-recorder.ts"),
      "@venix/sharing": path.resolve(__dirname, "packages/sharing/src/index.ts"),
      "@venix/analytics": path.resolve(__dirname, "packages/analytics/src/index.ts"),
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/web/test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
