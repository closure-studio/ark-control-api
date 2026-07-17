import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const domains = ["dashboard", "gcp", "health", "oidc", "pyhelper", "vps", "watcher"];
const sourceLayers = [
  "constants",
  "controller",
  "db",
  "errors",
  "repositories",
  "router",
  "schemas",
  "services",
  "utils"
];
const legacySourceLocations = [
  "controller/shared",
  "controller/utils",
  "env.ts",
  "gcp",
  "gcp/worker/controller",
  "gcp/worker/router",
  "oidc/controller",
  "oidc/router",
  "retention.ts",
  "types",
  "vps/worker/routes",
  "vps",
  "watcher",
  "watcher/controllers",
  "watcher/routes",
  "router/shared",
  "router/utils"
];

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("router to controller architecture", () => {
  it("uses one conventional top-level directory per responsibility", () => {
    const directories = readdirSync(sourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const rootTypescriptFiles = readdirSync(sourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name);

    expect(directories).toEqual(sourceLayers);
    expect(rootTypescriptFiles).toEqual(["index.ts"]);
  });

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

  it("does not retain legacy domain and HTTP locations", () => {
    for (const path of legacySourceLocations) {
      expect(existsSync(join(sourceRoot, path))).toBe(false);
    }
  });

  it("keeps HTTP route registration out of the Worker entrypoint", () => {
    const source = readFileSync(join(sourceRoot, "index.ts"), "utf8");
    expect(source).not.toMatch(/from ["']hono["']/);
    expect(source).not.toMatch(/\.(?:all|get|notFound|onError|patch|post|put|route|use)\(/);
  });

  it("groups cross-cutting utilities and schemas by concern", () => {
    const expectedLocations = [
      "constants/api",
      "constants/oidc",
      "constants/vps",
      "constants/watcher",
      "errors",
      "repositories/vps",
      "repositories/watcher",
      "services/gcp",
      "services/oidc",
      "services/pyhelper",
      "services/task-server",
      "services/vps",
      "services/watcher",
      "utils/gcp",
      "utils/http",
      "utils/oidc",
      "utils/watcher",
      "schemas/dashboard",
      "schemas/env.ts",
      "schemas/gcp",
      "schemas/oidc",
      "schemas/task-server",
      "schemas/vps",
      "schemas/watcher"
    ];
    for (const path of expectedLocations) {
      expect(existsSync(join(sourceRoot, path))).toBe(true);
    }
  });

  it("does not use explicit any or unchecked type assertions", () => {
    const violations: string[] = [];

    for (const path of typescriptFiles(sourceRoot)) {
      const source = readFileSync(path, "utf8");
      const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      function visit(node: ts.Node): void {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
          violations.push(`${path}:${position.line + 1}: explicit any`);
        }
        if (
          ts.isTypeAssertionExpression(node) ||
          (ts.isAsExpression(node) && node.type.getText(sourceFile) !== "const")
        ) {
          violations.push(`${path}:${position.line + 1}: unchecked type assertion`);
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    expect(violations).toEqual([]);
  });

  it("keeps repositories independent of HTTP and service layers", () => {
    for (const path of typescriptFiles(join(sourceRoot, "repositories"))) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/from ["'][^"']*(?:controller|router|services)[^"']*["']/);
      expect(source, path).not.toMatch(/from ["']hono(?:\/[^"']*)?["']/);
    }
  });

  it("keeps services independent of HTTP layers", () => {
    for (const path of typescriptFiles(join(sourceRoot, "services"))) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/from ["'][^"']*(?:controller|router)[^"']*["']/);
      expect(source, path).not.toMatch(/from ["']hono(?:\/[^"']*)?["']/);
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
    const protocolRouters = new Set(["health", "oidc"]);
    for (const domain of domains.filter((domain) => !protocolRouters.has(domain))) {
      for (const path of typescriptFiles(join(sourceRoot, "router", domain))) {
        const source = readFileSync(path, "utf8");
        expect(source, path).not.toMatch(/\bc\.json\(/);
      }
    }
  });
});
