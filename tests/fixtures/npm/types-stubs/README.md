# npm `@types/*` stub-deprecation fixtures

These fixtures lock the `@types/*` stub-package edge case from [#822](https://github.com/arminazimi/evergreen/issues/822) into on-disk repositories that `tests/npm.test.ts` scans. Stub rules such as `npm.package.types.glob.deprecated` match only when a declared (non-peer) dependency resolves to a deprecated stub release.

| Fixture | Contains | Expected |
| --- | --- | --- |
| `positive/` | `@types/glob` `^9.0.0` in `dependencies`, lock resolves `9.0.0` | one finding: `npm.package.types.glob.deprecated` on `package.json` |
| `negative/` | non-deprecated `@types/node`, unrelated scoped `@acme/widgets`, and a source string/comment mentioning `@types/glob` | zero `npm.package.types.*.deprecated` findings |
