import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const domains = ["dashboard", "gcp", "oidc", "pyhelper", "utils", "vps", "watcher"];
const legacyHttpDirectories = [
  "controller/shared",
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

describe("router to controller architecture", () => {
  it("groups every HTTP domain under router and controller", () => {
    for (const domain of domains) {
      expect(existsSync(join(sourceRoot, "router", domain))).toBe(true);
      expect(existsSync(join(sourceRoot, "controller", domain))).toBe(true);
    }
  });

  it("keeps Hono and router dependencies out of controllers", () => {
    for (const path of typescriptFiles(join(sourceRoot, "controller"))) {
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

  it("keeps HTTP route registration out of the Worker entrypoint", () => {
    const source = readFileSync(join(sourceRoot, "index.ts"), "utf8");
    expect(source).not.toMatch(/from ["']hono["']/);
    expect(source).not.toMatch(/\.(?:all|get|notFound|onError|patch|post|put|route|use)\(/);
  });

  it("groups cross-cutting utilities and types by concern", () => {
    const expectedDirectories = [
      "constants/api",
      "constants/oidc",
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

  it("keeps HTTP error code definitions in categorized constants", () => {
    const errorCodeLiterals = [
      "bad_request",
      "cloud_create_failed",
      "gcp_error",
      "host_registration_failed",
      "internal_error",
      "invalid_download_request",
      "invalid_request",
      "not_found",
      "pyhelper_download_failed",
      "request_failed",
      "server_error",
      "unauthorized"
    ];
    const allowedRoot = join(sourceRoot, "constants");

    for (const path of typescriptFiles(sourceRoot)) {
      if (path.startsWith(allowedRoot)) continue;
      const source = readFileSync(path, "utf8");
      for (const code of errorCodeLiterals) {
        expect(source, `${path}: ${code}`).not.toContain(`"${code}"`);
      }
    }
  });

  it("prevents domain routers from bypassing controllers", () => {
    for (const domain of domains) {
      for (const path of typescriptFiles(join(sourceRoot, "router", domain))) {
        const source = readFileSync(path, "utf8");
        expect(source, path).not.toMatch(
          /from ["'][^"']*(?:worker|models|services|repositories)[^"']*["']/
        );
      }
    }
  });

  it("keeps JSON envelope serialization in shared HTTP utilities", () => {
    const protocolRouters = new Set(["oidc", "utils"]);
    for (const domain of domains.filter((domain) => !protocolRouters.has(domain))) {
      for (const path of typescriptFiles(join(sourceRoot, "router", domain))) {
        const source = readFileSync(path, "utf8");
        expect(source, path).not.toMatch(/\bc\.json\(/);
      }
    }
  });
});
