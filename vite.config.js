import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

export default defineConfig({
  plugins: [react(), mcpPlugin()],

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.js"],
    include: ["src/**/__tests__/**/*.{test,spec}.{js,jsx}"],
    exclude: ["tests/integration/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/lib/**", "src/serviceLines/**", "src/data/**"],
      // Large JSX service-line files mix pure calc exports (tested) with
      // many tab components (not yet fully tested). Excluded to keep thresholds
      // meaningful; remove each exclusion as its tab tests land.
      exclude: [
        "src/serviceLines/tsc.jsx",
        "src/serviceLines/childrens_dda.jsx",
        "src/serviceLines/cse.jsx",
        "src/**/__tests__/**",
      ],
      thresholds: {
        statements: 80,
        branches: 75,
      },
    },
  },
});
