# 0029 — Cut scanner complexity by extracting the line masker and replacing branch chains with tables

Status: accepted

## Problem

Issue #2275 (epic #2221) lists seven functions above the complexity ceiling of 15. Four of them carry the debt:
`maskCodeLine` (130), `analyzeSourceUsage` (96), `isUsageMatcher` (32), and `javascriptImports` (19). The other
three — `phpRequires`, `languageFor`, `moduleMatches` — already measure 9, 1, and 8 on `main` after the #2226
split removed their entries, so they need no change here.

`isUsageMatcher` is exported from `src/sdk.ts`, the detector SDK, so this change touches a public contract file
and needs a record even though the exported surface is unchanged.

## Options compared

| Option | What it does | Cost |
| --- | --- | --- |
| Extract, keep the file | Move the per-language literal scanner into `src/usage/masking.ts`; split the two long readers into named steps | A new module and a new import edge |
| Table-driven dispatch | Replace the language `if` chains with lookup tables keyed by language and by matcher shape | Table definitions alongside the readers |
| Rewrite on tree-sitter | Parse every language with the vendored WASM grammars instead of masking lines | Slower, changes which usages are found, needs a grammar per edge case |
| Keep the chains, add a plugin registry | Let each detector package register a masker | Widens the SDK contract and moves the same branches behind a registry |
| Raise the ceiling or keep the allowlist rows | Leave the debt | Forbidden by `AGENTS.md`: an entry is a ceiling, never raised |

## Measurements

Complexity and length are read with the gate's own `functionMeasures()` (`tools/check-quality.ts`), on `main` at
`bb92ae76` and on this branch.

| Function | Before | After |
| --- | --- | --- |
| `maskCodeLine` (`src/source-usage.ts` → `src/usage/masking.ts`) | complexity 130, 198 lines | complexity 5, 10 lines |
| `analyzeSourceUsage` (`src/source-usage.ts`) | complexity 96, 268 lines | complexity 2, 7 lines |
| `isUsageMatcher` (`src/sdk.ts`) | complexity 32, 52 lines | complexity 7, 8 lines |
| `javascriptImports` (`src/source-usage.ts`) | complexity 19, 63 lines | complexity 5, 17 lines |

The largest function now in `src/usage/masking.ts` measures complexity 11 and 26 lines, so no replacement entry is
needed. `src/source-usage.ts` went from 795 to 709 lines and `src/usage/masking.ts` from 123 to 496.

Behavior is proved by a differential harness, not by inspection. It loads the shipped `maskCodeLine` from a clean
build of `bb92ae76` and the refactored one from this branch and compares them line by line, carrying a separate
mask state per build, over 2,555 real repository files, 22 hand-written adversarial files, and 6,400 fuzzed files
(400 per language × 16 languages, seeded PRNG): **4,328,416 masked lines identical, zero mismatches**. The same
harness runs `analyzeSourceUsage` over a multi-language fixture tree and over `src/` and `tests/`, with and without
the tree-sitter parser, and compares the full JSON: **6 runs identical** (9,624 / 9,828 / 1,158 / 1,158 / 12,044 /
11,830 bytes). `npm run check` passes with the eight allowlist rows deleted.

## Decision

1. **The line masker lives in `src/usage/masking.ts`.** `src/source-usage.ts` is 795 lines on `main`, and the
   800-line file gate fails any in-file split of `maskCodeLine`, so the scanner moves to its own module and
   `source-usage.ts` imports it. `maskCodeLine` keeps its signature and stays exported.
2. **Branch chains become tables.** The masker walks a cursor through an ordered list of named steps; the import
   and call readers dispatch on a per-language table; `isUsageMatcher` dispatches on a per-shape predicate. Each
   table entry is a function with a name, so a failing language is one row, not one `else if`.
3. **The SDK contract does not change.** `src/sdk.ts` keeps its 19 exports with the same signatures; only the
   validation body is restructured. A language or shape set is a named `Set`, so a new ecosystem is one line in
   the set that owns it.
4. **Debt is deleted, never moved.** The four complexity rows and the four matching function-size rows are removed
   from `benchmarks/quality-allowlist.json`, and the two ESLint suppressions that no longer fire are pruned. No
   row, ceiling, `any`, or non-null assertion is added.

## Why

- **A table names the case.** 130 branches in one function cannot be reviewed; eleven steps of 10 to 26 lines can,
  and each is exercised by the masking tests in `tests/source-usage-masking.test.ts`.
- **The split is forced by a rule that already exists.** The file-size gate, not taste, decides where the masker
  goes; keeping it in `source-usage.ts` would need an allowlist entry, which `AGENTS.md` forbids.
- **Parity evidence beats a green suite here.** The masker's per-language quirks (Ruby percent literals, PHP and
  Ruby heredocs, C# verbatim strings, Swift multiline strings) are individually rare, so the differential corpus
  over 4.3M real and generated lines is the check that they still behave as before.

## Consequences

- `src/usage/masking.ts` is now the home for language literal rules; a new scanner language adds a step and a
  table row there rather than a branch in `maskCodeLine`.
- `src/usage/dynamic-references.ts` imports the masker from its new path. Its own import of
  `phpRequires`/`rubyInvocations` from `src/source-usage.ts` stays, so the SDK-to-scanner edge is unchanged.
- The three functions #2226 already fixed are left alone, and `readRubyLiteral`, `rubyInvocations`, and
  `rubyKeywordIsCall` stay allowlisted under #2276, which owns them.
- The differential harness lives in `/tmp`, not in the repository. Rebuilding it costs a corpus run; the committed
  masking tests are the durable guard, and the harness was the one-time proof for this refactor.
