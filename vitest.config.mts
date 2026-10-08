import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["scripts/__tests__/**/*.test.{ts,mjs}", "components/game/**/*.test.{ts,tsx}", "components/avatar/**/*.test.{ts,tsx}"],
  },
});
