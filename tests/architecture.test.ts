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
const routeMethods = new Set(["all", "delete", "get", "patch", "post", "put"]);

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function parseTypescriptFile(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
}

function lineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
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
      "constants/maintenance",
      "constants/notifications",
      "constants/oidc",
      "constants/vps",
      "constants/watcher",
      "errors",
      "repositories/vps",
      "repositories/watcher",
      "repositories/control-job-locks.ts",
      "repositories/maintenance",
      "services/gcp",
      "services/maintenance",
      "services/notifications",
      "services/oidc",
      "services/pyhelper",
      "services/task-server",
      "services/vps",
      "services/watcher",
      "utils/gcp",
      "utils/http",
      "utils/maintenance",
      "utils/oidc",
      "utils/watcher",
      "schemas/dashboard",
      "schemas/env.ts",
      "schemas/maintenance",
      "schemas/gcp",
      "schemas/health",
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

  it("derives exported schema contract types and prevents parallel declarations", () => {
    const schemasRoot = join(sourceRoot, "schemas");
    const schemaContractNames = new Set<string>();
    const violations: string[] = [];

    for (const path of typescriptFiles(schemasRoot)) {
      const sourceFile = parseTypescriptFile(path);
      for (const statement of sourceFile.statements) {
        if (ts.isInterfaceDeclaration(statement) && isExported(statement)) {
          violations.push(`${path}:${lineNumber(sourceFile, statement)}: exported schema interface`);
        }
        if (!ts.isTypeAliasDeclaration(statement) || !isExported(statement)) continue;
        schemaContractNames.add(statement.name.text);
        const typeExpression = statement.type.getText(sourceFile).replace(/\s+/g, "");
        if (!/^v\.InferOutput<typeof[A-Za-z_$][\w$]*Schema>$/.test(typeExpression)) {
          violations.push(
            `${path}:${lineNumber(sourceFile, statement)}: schema type must use v.InferOutput`
          );
        }
      }
    }

    for (const path of typescriptFiles(sourceRoot)) {
      if (path.startsWith(schemasRoot)) continue;
      const sourceFile = parseTypescriptFile(path);
      for (const statement of sourceFile.statements) {
        if (
          (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
          schemaContractNames.has(statement.name.text)
        ) {
          violations.push(
            `${path}:${lineNumber(sourceFile, statement)}: parallel schema contract ${statement.name.text}`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires Standard Schema validators for Hono request inputs", () => {
    const violations: string[] = [];

    for (const path of typescriptFiles(join(sourceRoot, "router"))) {
      const sourceFile = parseTypescriptFile(path);

      function visit(node: ts.Node): void {
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "req" &&
          ["json", "param", "query"].includes(node.name.text)
        ) {
          violations.push(
            `${path}:${lineNumber(sourceFile, node)}: direct c.req.${node.name.text} access`
          );
        }

        if (
          !ts.isCallExpression(node) ||
          !ts.isPropertyAccessExpression(node.expression) ||
          !routeMethods.has(node.expression.name.text)
        ) {
          ts.forEachChild(node, visit);
          return;
        }
        const routePath = node.arguments[0];
        if (!routePath || !ts.isStringLiteral(routePath) || !routePath.text.startsWith("/")) {
          ts.forEachChild(node, visit);
          return;
        }

        const validators = new Set<string>();
        const validatedInputs = new Set<string>();

        function inspectRoute(routeNode: ts.Node): void {
          const target = ts.isCallExpression(routeNode) ? routeNode.arguments[0] : undefined;
          if (
            ts.isCallExpression(routeNode) &&
            ts.isIdentifier(routeNode.expression) &&
            routeNode.expression.text === "sValidator" &&
            target &&
            ts.isStringLiteral(target)
          ) {
            validators.add(target.text);
          }
          if (
            ts.isCallExpression(routeNode) &&
            ts.isPropertyAccessExpression(routeNode.expression) &&
            routeNode.expression.name.text === "valid" &&
            target &&
            ts.isStringLiteral(target)
          ) {
            validatedInputs.add(target.text);
          }
          ts.forEachChild(routeNode, inspectRoute);
        }

        for (const argument of node.arguments.slice(1)) inspectRoute(argument);
        for (const target of validatedInputs) {
          if (!validators.has(target)) {
            violations.push(
              `${path}:${lineNumber(sourceFile, node)}: c.req.valid(${target}) lacks sValidator`
            );
          }
        }
        if (routePath.text.includes(":") && !validators.has("param")) {
          violations.push(
            `${path}:${lineNumber(sourceFile, node)}: parameterized route lacks param sValidator`
          );
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
