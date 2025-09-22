import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionFile = resolve(__dirname, "../VERSION.ini");
const appVersion = readVersionFromIni(versionFile);

function readVersionFromIni(path: string): string {
  const fallback = "0.0.0-dev";

  try {
    const contents = readFileSync(path, "utf8");
    const match = contents.match(/^\s*version\s*=\s*(.+)$/im);
    if (!match) {
      return fallback;
    }

    const value = match[1].trim();
    return value || fallback;
  } catch (error) {
    console.warn(`Kon versiebestand niet lezen (${path}):`, error);
    return fallback;
  }
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
