import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const DETERMINISM_MESSAGE =
  "The engine must be deterministic: use context.prng and context.nowMicros instead.";

const eslintConfig = defineConfig([
  globalIgnores(["node_modules/**", "coverage/**"]),
  {
    files: ["**/*.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        { selector: ["function", "classMethod"], format: ["camelCase"] },
        { selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Use named exports.",
        },
      ],
    },
  },
  {
    // Tool config files are required to default-export.
    files: ["*.config.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "Date", message: DETERMINISM_MESSAGE },
        { name: "performance", message: DETERMINISM_MESSAGE },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: DETERMINISM_MESSAGE },
      ],
    },
  },
  {
    // Typed-array hot paths: indices are maintained by the data structure itself,
    // so the `undefined` that noUncheckedIndexedAccess adds can never occur.
    files: ["src/kernel/des/event-queue.ts", "src/kernel/des/event-loop.ts", "src/metrics/metric-recorder.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["src/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/include": ["src/**/*.ts"],
      // registry.ts and index.ts sit outside every element: nothing below may import
      // them, and they may import anything.
      "boundaries/elements": [
        { type: "contract", pattern: "src/contract" },
        { type: "kernel", pattern: "src/kernel" },
        { type: "metrics", pattern: "src/metrics" },
        { type: "component", pattern: "src/components/*", capture: ["componentName"] },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkUnknownLocals: true,
          policies: [
            {
              from: { element: { type: "contract" } },
              allow: { to: { element: { type: "contract" } } },
            },
            {
              from: { element: { type: "metrics" } },
              allow: { to: { element: { types: { anyOf: ["contract", "metrics"] } } } },
            },
            {
              from: { element: { type: "kernel" } },
              allow: {
                to: { element: { types: { anyOf: ["contract", "kernel", "metrics"] } } },
              },
            },
            {
              // A component sees the contract and its own folder, nothing else.
              from: { element: { type: "component" } },
              allow: {
                to: [
                  { element: { type: "contract" } },
                  {
                    element: {
                      type: "component",
                      captured: {
                        componentName: "{{ from.element.captured.componentName }}",
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
