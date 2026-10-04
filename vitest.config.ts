import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", fileParallelism: false, maxWorkers: 1, setupFiles: ["./tests/setup.ts"], testTimeout: 15_000, hookTimeout: 30_000 },
});
