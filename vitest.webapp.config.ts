import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.*"],
    exclude: [
      "tests/e2e/**",
      "tests/catalog-extension-*.test.mjs",
      "tests/gas-contract.test.mjs",
      "tests/gas-build.test.mjs",
    ],
  },
});
