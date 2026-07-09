import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const evalRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["evals/cases/**/*.eval.ts"],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    reporters: ["verbose"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: "@/core/platform/tauri",
        replacement: resolve(evalRoot, "harness/tauri-shim.ts"),
      },
      {
        find: "@",
        replacement: resolve(evalRoot, "../src"),
      },
    ],
  },
});
