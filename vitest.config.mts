import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Every case is short (the heavy campus matrices are split per wall face and per file, so the
    // runner spreads them over its workers). The timeout is only a safety net for a host that is
    // many times oversubscribed: a 1 s physics case then still has a minute, not the default 5 s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ["scripts/__tests__/**/*.test.{ts,mjs}", "components/game/**/*.test.{ts,tsx}", "components/avatar/**/*.test.{ts,tsx}"],
  },
});
