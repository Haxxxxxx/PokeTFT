import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build artifacts / generated bundles — not hand-written source.
    "functions/lib/**",     // esbuild output of the Cloud Functions bundle
    "functions/node_modules/**",
    "tools/.cache-*.json",  // PokéAPI fetch caches
  ]),
]);

export default eslintConfig;
