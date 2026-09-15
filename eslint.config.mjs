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
    // Plain CJS Node bootstrap that patches module resolution before tsx
    // loads — require() is the point, not something to lint against.
    "scripts/with-server-only-stub.cjs",
    "scripts/server-only-stub.cjs",
  ]),
]);

export default eslintConfig;
