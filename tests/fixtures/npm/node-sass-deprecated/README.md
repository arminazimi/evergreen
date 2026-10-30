# npm `node-sass` deprecated fixtures

These fixtures lock the `npm.package.node-sass.deprecated` rule from [#1701](https://github.com/arminazimi/evergreen/issues/1701) into on-disk repositories that `tests/npm.test.ts` scans. The deprecated rule matches declared (non-peer) dependencies that resolve to a published node-sass release; scans may also emit `npm.package.node-sass.eol`.

| Fixture | Contains | Expected |
| --- | --- | --- |
| `positive/` | `node-sass` `^9.0.0` in `dependencies`, lock resolves `9.0.0` | finding: `npm.package.node-sass.deprecated` on `package.json` (also emits `npm.package.node-sass.eol`) |
| `negative/` | maintained `sass` dependency, and a source string/comment mentioning `node-sass` | zero `npm.package.node-sass.deprecated` findings |
