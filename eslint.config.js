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
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
