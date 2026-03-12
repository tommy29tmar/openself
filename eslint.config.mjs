import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    ignores: [
      ".next/**",
      ".worktrees/**",
      "dist/**",
      "node_modules/**",
      "db/**/*.db",
      "db/**/*.db-shm",
      "db/**/*.db-wal",
      "coverage/**",
      "e2e/**",
      "scripts/**",
      "tests/**",
      "uat/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
];

export default config;
