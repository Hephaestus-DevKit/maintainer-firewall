import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts"
    ],
    exclude: [
      "dist/**",
      "lib/**",
      "node_modules/**"
    ],
    coverage: {
      provider: "v8",
      include: [
        "src/**/*.ts"
      ],
      exclude: [
        "src/index.ts",
        "src/types.ts"
      ],
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 90,
        lines: 85
      }
    }
  }
});
