import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3199",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:3199/api/health",
    env: {
      PORT: "3199",
      DATABASE_URL: "",
      ADMIN_PASSWORD: "local-test-password",
      OPENAI_API_KEY: "",
    },
    reuseExistingServer: false,
  },
});
