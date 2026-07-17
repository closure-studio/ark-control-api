import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const domains = ["dashboard", "gcp", "oidc", "pyhelper", "vps", "watcher"];
const legacyHttpDirectories = [
  "control/shared",
  "gcp/worker/controller",
  "gcp/worker/router",
  "oidc/controller",
  "oidc/router",
  "vps/worker/routes",
  "watcher/controllers",
  "watcher/routes",
  "router/shared"
];

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("router to control architecture", () => {
  it("groups every HTTP domain under router and control", () => {
    for (const domain of domains) {
      expect(existsSync(join(sourceRoot, "router", domain))).toBe(true);
      expect(existsSync(join(sourceRoot, "control", domain))).toBe(true);
    }
  });

  it("keeps Hono and router dependencies out of controls", () => {
    for (const path of typescriptFiles(join(sourceRoot, "control"))) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/from ["']hono(?:\/[^"']*)?["']/);
      expect(source, path).not.toMatch(/from ["'][^"']*router[^"']*["']/);
    }
  });

  it("does not retain legacy HTTP directories", () => {
    for (const path of legacyHttpDirectories) {
      expect(existsSync(join(sourceRoot, path))).toBe(false);
    }
  });

  it("groups cross-cutting utilities and types by concern", () => {
    const expectedDirectories = [
      "types/control",
      "types/dashboard",
      "types/http",
      "types/vps",
      "utils/http"
    ];
    for (const path of expectedDirectories) {
      expect(existsSync(join(sourceRoot, path))).toBe(true);
    }
  });

  it("prevents domain routers from bypassing controls", () => {
    for (const domain of domains) {
      for (const path of typescriptFiles(join(sourceRoot, "router", domain))) {
        const source = readFileSync(path, "utf8");
        expect(source, path).not.toMatch(
          /from ["'][^"']*(?:worker|models|services|repositories)[^"']*["']/
        );
      }
    }
  });
});
