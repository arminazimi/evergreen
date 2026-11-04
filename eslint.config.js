// Type-aware lint. The TypeScript build already runs on every `npm run check`; these rules read the
// same program through the project service, so they catch bugs the compiler cannot express.
//
// `eslint-suppressions.json` records the violations that existed when typed lint was introduced. A
// new violation fails the check, and a suppression that no longer matches fails too, so the baseline
// can only shrink. Regenerate it with `npm run lint:baseline` when a rule is added to the config.

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src/usage/vendor/**", "tests/fixtures/**"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      // `any` and unchecked type assertions are forbidden. Where an external boundary needs a cast
      // (parsing repository JSON, reading a response body), mark that single site with a scoped
      // `eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- <reason>` instead of
      // widening the type. Everywhere else, narrow through a type guard.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      // A promise must be awaited, returned, or explicitly discarded with `void`; an empty catch
      // must not swallow its error. Both rules already arrive through `recommendedTypeChecked` and
      // `js/recommended`; they are pinned here so a preset change cannot silently turn them off.
      // A deliberate swallow needs a scoped disable naming the reason.
      "@typescript-eslint/no-floating-promises": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
