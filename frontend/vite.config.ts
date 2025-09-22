import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionFile = resolve(__dirname, "../VERSION");
let appVersion = "0.0.0-dev";

try {
  appVersion = readFileSync(versionFile, "utf8").trim() || appVersion;
} catch (error) {
  console.warn(`Kon versiebestand niet lezen (${versionFile}):`, error);
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    css: true,
  },
});
