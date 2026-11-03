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
    "out-landing/**",       // static export of the landing site
    "tools/.cache-*.json",  // PokéAPI fetch caches
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        // `const { omitMe, ...rest } = obj` is how we strip a key (see ACHIEVEMENTS);
        // the binding is unused ON PURPOSE and shouldn't be reported.
        ignoreRestSiblings: true,
        // Conventional opt-out for deliberately unused bindings.
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
]);

export default eslintConfig;
