import { defineConfig, globalIgnores } from "eslint/config";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Next's recommended rules plus its TypeScript pass. The ignore list is
 * restated because eslint-config-next replaces it rather than extending it.
 */
export default defineConfig([
  ...coreWebVitals,
  ...typescript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "data/**",
    "public/uploads/**",
  ]),
]);
