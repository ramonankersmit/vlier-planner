#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const samplesDir = path.join(repoRoot, "samples");

const files = [
  {
    base64: "voorbeeld-studiewijzer.pdf.base64",
    output: "voorbeeld-studiewijzer.pdf",
    description: "voorbeeld studiewijzer als PDF",
  },
  {
    base64: "voorbeeld-studiewijzer.docx.base64",
    output: "voorbeeld-studiewijzer.docx",
    description: "voorbeeld studiewijzer als Word-document",
  },
];

async function decode(base64Path, outputPath) {
  const encoded = await readFile(base64Path, "utf8");
  const buffer = Buffer.from(encoded.trim(), "base64");
  await writeFile(outputPath, buffer);
}

async function main() {
  for (const file of files) {
    const base64Path = path.join(samplesDir, file.base64);
    const outputPath = path.join(samplesDir, file.output);
    await decode(base64Path, outputPath);
    console.log(`✔️  ${file.description} opgeslagen als ${file.output}`);
  }
  console.log("Klaar! De bestanden staan nu in de map samples/.");
}

main().catch((error) => {
  console.error("Het decoderen van de voorbeeldbestanden is mislukt:", error);
  process.exitCode = 1;
});
