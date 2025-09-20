import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const BASE_URL = process.env.APP_BASE_URL ?? "http://127.0.0.1:5173";
const OUTPUT_DIR = resolve("./public/screenshots");

const targets = [
  { route: "/", name: "weekoverzicht", selector: "main" },
  { route: "/matrix", name: "matrix", selector: "main" },
  { route: "/uploads", name: "uploads", selector: "main" },
];

function ensureDir(path) {
  try {
    mkdirSync(path, { recursive: true });
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }
}

async function capture() {
  ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  for (const target of targets) {
    const url = `${BASE_URL}${target.route}`;
    console.log(`Capturing ${url}`);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const locator = page.locator(target.selector).first();
    await locator.waitFor({ state: "visible" });
    const path = resolve(OUTPUT_DIR, `${target.name}.png`);
    await locator.screenshot({ path, animations: "disabled", scale: "device" });
    console.log(`Saved ${path}`);
  }

  await browser.close();
}

capture().catch((error) => {
  console.error(error);
  process.exit(1);
});
