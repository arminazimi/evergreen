# `node-sass` deprecation fixtures

These fixtures lock the reviewed `npm.package.node-sass.deprecated` rule into on-disk repositories that the npm
detector scans. npm marks every published `node-sass` release as deprecated.

| Fixture | Contains | Expected |
| --- | --- | --- |
| `match/` | `node-sass` `^9.0.0` in `devDependencies`, a lock resolving `9.0.0`, and a `renderSync` import | one `npm.package.node-sass.deprecated` finding on `package.json` |
| `clean/` | the maintained `sass` package and a source string that only mentions `node-sass` | zero `npm.package.node-sass.deprecated` findings |
