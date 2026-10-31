import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([
    "**/.next/**",
    "xiongzai-reference-website/backups/**",
    "xiongzai-reference-website/releases/**",
    "xiongzai-reference-website/qa/fidelity-repair/before-dist/**",
    "**/gsap.min.js",
    "**/axe.min.js",
    "dist/**",
    "out/**",
    "output/**",
    "build/**",
    "**/.expo/**",
    "next-env.d.ts",
    ".local/backups/**",
    ".local/logs/**",
    ".local/postgres/**",
    // Extracted third-party package-manager tools are not product source.
    ".local/**/tools/package/**",
    ".wrangler/**",
    ".vinext/**",
    "**/node_modules/**",
    "**/dist/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // These conditional React Native search inputs mount only after an explicit
    // search-button press. Keep DOM autofocus checks, without treating TextInput
    // as an HTML input or changing its native keyboard behavior.
    files: [
      "apps/mobile/src/features/chat/messages-screen.tsx",
      "apps/mobile/src/features/seller/seller-services-screen.tsx",
    ],
    rules: { "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }] },
  },
  {
    // The QA programs evaluate these browser globals, supplied by the actual website bundles.
    files: ["xiongzai-reference-website/qa/**/*.mjs"],
    languageOptions: { globals: { XiongzaiFriends: "readonly", XiongzaiMotion: "readonly", XiongzaiFlight: "readonly", XiongzaiWake: "readonly", XiongzaiCosmic: "readonly", XiongzaiWind: "readonly", XiongzaiRail: "readonly", XiongzaiParkedRail: "readonly", gsap: "readonly", __bench: "writable", __perf: "writable", events: "writable" } },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
]);

export default eslintConfig;
