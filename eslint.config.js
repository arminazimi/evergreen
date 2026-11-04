// Type-aware lint. The TypeScript build already runs on every `npm run check`; these rules read the
// same program through the project service, so they catch bugs the compiler cannot express.
//
// `eslint-suppressions.json` records the violations that existed when typed lint was introduced. A
// new violation fails the check, and a suppression that no longer matches fails too, so the baseline
// can only shrink. Regenerate it with `npm run lint:baseline` when a rule is added to the config.

import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { basename, relative, resolve, sep } from "node:path";

import eslint from "@eslint/js";
import ts from "typescript";
import tseslint from "typescript-eslint";

// Module layout. File names are kebab-case. Capability modules are the one exception: their file name
// is the capability ID, which is dotted (`deprecation.list.ts`), and `index.generated.ts` is generated.
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GENERATED_SUFFIX = ".generated";
const CAPABILITY_MODULE_DIRECTORIES = ["src/capabilities/capabilities/", "src/capabilities/surfaces/"];

function followsKebabCase(filename) {
  const path = relative(import.meta.dirname, filename).split(sep).join("/");
  const stem = basename(path, ".ts");
  const segments = CAPABILITY_MODULE_DIRECTORIES.some((directory) => path.startsWith(directory))
    ? stem.split(".")
    : [stem];
  return segments.every((segment) => KEBAB_CASE.test(segment.replace(GENERATED_SUFFIX, "")));
}

const NODE_BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

// The package surface is the entry points in `package.json` (`exports`). A symbol is public when an
// entry point exports it, directly or through a re-export; its doc comment belongs on the declaration.
const PACKAGE_JSON = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const PUBLIC_ENTRY_POINTS = Object.values(PACKAGE_JSON.exports).flatMap((entry) =>
  typeof entry === "object" && typeof entry.import === "string"
    ? [entry.import.replace(/^\.\/dist\//, "./").replace(/\.js$/, ".ts")]
    : [],
);

/** Public declaration names by source file, computed once per TypeScript program. */
const publicDeclarationsByProgram = new WeakMap();

function publicDeclarations(program) {
  const cached = publicDeclarationsByProgram.get(program);
  if (cached) return cached;
  const checker = program.getTypeChecker();
  const byFile = new Map();
  for (const entry of PUBLIC_ENTRY_POINTS) {
    const sourceFile = program.getSourceFile(resolve(import.meta.dirname, entry));
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) continue;
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      let symbol = exported;
      if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      for (const declaration of symbol.getDeclarations() ?? []) {
        const name = declaration.name?.text;
        if (typeof name !== "string") continue;
        const file = resolve(import.meta.dirname, declaration.getSourceFile().fileName);
        const names = byFile.get(file) ?? new Set();
        names.add(name);
        byFile.set(file, names);
      }
    }
  }
  publicDeclarationsByProgram.set(program, byFile);
  return byFile;
}

/** The text of a doc comment without its delimiters and leading asterisks. */
function docText(comment) {
  return comment.value
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, ""))
    .join(" ")
    .trim();
}

/** Letters and digits only, so name and description compare regardless of case or punctuation. */
function comparable(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const localPlugin = {
  meta: { name: "evergreen-local" },
  rules: {
    "kebab-case-filename": {
      meta: {
        type: "problem",
        docs: { description: "Require kebab-case source file names." },
        schema: [],
        messages: { unexpectedName: 'Rename "{{name}}" to kebab-case (lowercase words separated by hyphens).' },
      },
      create(context) {
        return {
          Program(node) {
            if (followsKebabCase(context.filename)) return;
            context.report({
              node,
              messageId: "unexpectedName",
              data: { name: basename(context.filename) },
            });
          },
        };
      },
    },
    "node-protocol-imports": {
      meta: {
        type: "problem",
        docs: { description: "Require the node: prefix on Node.js built-in module imports." },
        schema: [],
        messages: { missingPrefix: 'Import "{{name}}" as "node:{{name}}".' },
      },
      create(context) {
        const checkSource = (node) => {
          const specifier = node.source?.value;
          if (typeof specifier !== "string" || !NODE_BUILTINS.has(specifier)) return;
          context.report({ node, messageId: "missingPrefix", data: { name: specifier } });
        };
        return { ImportDeclaration: checkSource, ImportExpression: checkSource };
      },
    },
    "public-api-docs": {
      meta: {
        type: "problem",
        docs: { description: "Require a doc comment on every symbol exported from the package entry points." },
        schema: [],
        messages: {
          missing: 'Document the public symbol "{{name}}" with a doc comment that states its behavior.',
          repeatsName: 'The doc comment for "{{name}}" repeats the name; state its behavior instead.',
        },
      },
      create(context) {
        const program = context.sourceCode.parserServices?.program;
        if (!program) return {};
        const names = publicDeclarations(program).get(resolve(import.meta.dirname, context.filename));
        if (!names) return {};
        return {
          Program(node) {
            for (const statement of node.body) {
              if (statement.type !== "ExportNamedDeclaration" || statement.declaration === null) continue;
              const declaration = statement.declaration;
              const identifiers =
                declaration.type === "VariableDeclaration"
                  ? declaration.declarations.map((declarator) => declarator.id)
                  : [declaration.id];
              const doc = context.sourceCode
                .getCommentsBefore(statement)
                .find((comment) => comment.type === "Block" && comment.value.startsWith("*"));
              for (const identifier of identifiers) {
                if (identifier?.type !== "Identifier" || !names.has(identifier.name)) continue;
                if (!doc) {
                  context.report({ node: statement, messageId: "missing", data: { name: identifier.name } });
                } else if (comparable(docText(doc)) === comparable(identifier.name)) {
                  context.report({ node: statement, messageId: "repeatsName", data: { name: identifier.name } });
                }
              }
            }
          },
        };
      },
    },
  },
};

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
      // Naming. Types are PascalCase and every identifier that is not a fixed-value constant is
      // camelCase. Destructured names and properties mirror the document they come from (MCP tool
      // inputs, GitHub API responses, SPDX and CycloneDX fields), so those selectors are not checked.
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"], leadingUnderscore: "allow", trailingUnderscore: "forbid" },
        { selector: "variable", format: ["camelCase", "UPPER_CASE"], leadingUnderscore: "allow" },
        { selector: "function", format: ["camelCase"] },
        { selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow" },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "import", format: ["camelCase", "PascalCase", "UPPER_CASE"] },
        { selector: "variable", modifiers: ["destructured"], format: null },
        { selector: "parameter", modifiers: ["destructured"], format: null },
        { selector: "objectLiteralProperty", format: null },
        { selector: "objectLiteralMethod", format: null },
        { selector: "typeProperty", format: null },
      ],
    },
  },
  {
    plugins: { local: localPlugin },
    rules: {
      "local/kebab-case-filename": "error",
      "local/node-protocol-imports": "error",
    },
  },
  {
    // Only the package surface is held to this: a symbol an entry point exports needs a doc comment
    // saying what it does, not one that restates its name.
    files: ["src/**/*.ts"],
    plugins: { local: localPlugin },
    rules: { "local/public-api-docs": "error" },
  },
  {
    // Capability modules are the only default exports: the capability registry imports them by their
    // capability ID. Everywhere else a module named its exports and callers name what they import.
    files: ["src/**/*.ts"],
    ignores: ["src/capabilities/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Use named exports outside src/capabilities/.",
        },
      ],
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
