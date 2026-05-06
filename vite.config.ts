import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/bff/",
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
