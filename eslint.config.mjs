import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const typedRules = {
  "@typescript-eslint/array-type": "off",
  "@typescript-eslint/consistent-type-definitions": "off",
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "off",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "preserve-caught-error": "off"
};

const typedConfigs = [
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked
];

export default defineConfig(
  {
    ignores: [
      ".codegraph/**",
      ".wrangler/**",
      "coverage/**",
      "dist/**",
      "migrations/**",
      "node_modules/**"
    ]
  },
  {
    files: ["src/**/*.ts"],
    extends: typedConfigs,
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: typedRules
  },
  {
    files: ["tests/**/*.ts"],
    extends: typedConfigs,
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      ...typedRules,
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/require-await": "off"
    }
  },
  {
    files: ["src/utils/apk-delivery/log.ts"],
    rules: { "no-control-regex": "off" }
  },
  {
    files: ["*.config.ts"],
    extends: typedConfigs,
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.tools.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: typedRules
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    ...eslint.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node
    }
  }
);
