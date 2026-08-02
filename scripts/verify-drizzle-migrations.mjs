import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migrationsDirectory = new URL("../migrations/", import.meta.url);

/**
 * @param {URL} directory
 * @param {string} prefix
 * @returns {Map<string, string>}
 */
function snapshot(directory, prefix = "") {
  const files = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      for (const [path, contents] of snapshot(url, relativePath)) files.set(path, contents);
    } else {
      files.set(relativePath, readFileSync(url, "utf8"));
    }
  }
  return files;
}

/**
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 */
function changesBetween(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

const before = snapshot(migrationsDirectory);
const result = spawnSync("drizzle-kit", ["generate", "--name=ci"], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (result.status !== 0) process.exit(result.status ?? 1);

const changes = changesBetween(before, snapshot(migrationsDirectory));
if (changes.length > 0) {
  console.error("Drizzle schema changes are missing a generated migration:");
  for (const path of changes) console.error(`  migrations/${path}`);
  process.exit(1);
}
