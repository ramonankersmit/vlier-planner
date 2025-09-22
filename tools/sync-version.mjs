#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const versionPath = resolve(rootDir, "VERSION");
const frontendDir = resolve(rootDir, "frontend");

const version = (await readFile(versionPath, "utf8")).trim();
if (!version) {
  console.error(`VERSION-bestand (${versionPath}) is leeg.`);
  process.exit(1);
}

async function updateJson(path, updater) {
  const current = JSON.parse(await readFile(path, "utf8"));
  const updated = updater(current);
  if (updated.changed) {
    await writeFile(path, `${JSON.stringify(updated.value, null, 2)}\n`, "utf8");
    console.log(`Bijgewerkt: ${path}`);
  }
}

await updateJson(resolve(frontendDir, "package.json"), (pkg) => {
  if (pkg.version === version) {
    return { value: pkg, changed: false };
  }

  return {
    value: { ...pkg, version },
    changed: true,
  };
});

await updateJson(resolve(frontendDir, "package-lock.json"), (lock) => {
  let changed = false;
  if (lock.version !== version) {
    lock.version = version;
    changed = true;
  }
  if (lock.packages && lock.packages[""] && lock.packages[""].version !== version) {
    lock.packages[""].version = version;
    changed = true;
  }
  return { value: lock, changed };
});

console.log(`Versie gesynchroniseerd naar ${version}.`);
