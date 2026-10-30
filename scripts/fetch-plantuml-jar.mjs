// Downloads the pinned PlantUML jar described in plantuml-jar.json and verifies its
// SHA-256, so the jar never has to be committed.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "scripts", "plantuml-jar.json"), "utf8"));
const target = join(root, config.path);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function existingMatches() {
  try {
    return sha256(await readFile(target)) === config.sha256;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function download() {
  const response = await fetch(config.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} (${config.url})`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== config.sha256) {
    throw new Error(`Checksum mismatch for ${config.url}: expected ${config.sha256}, got ${actual}`);
  }
  // Write next to the target and rename, so an interrupted run never leaves a partial jar.
  const partial = `${target}.partial`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(partial, bytes);
  try {
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

if (await existingMatches()) {
  console.log(`PlantUML ${config.version} already present at ${config.path}`);
} else {
  await download();
  console.log(`PlantUML ${config.version} downloaded to ${config.path}`);
}
