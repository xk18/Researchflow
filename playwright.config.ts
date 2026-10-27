import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  outputDir: process.env.RESEARCHFLOW_TEST_RESULTS_DIR ?? "./test-results",
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 900, height: 650 },
  },
  workers: 1,
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
  },
  reporter: "list",
});
