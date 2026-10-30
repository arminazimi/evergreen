# Smoke fixture

Tiny repository with known lifecycle findings. Package and release smoke tests scan it so the npm tarball, Docker image, and GitHub Action are exercised against the same inputs.

| Finding | Source |
| --- | --- |
| Deprecated `request` package | `package.json` dependencies |
| End-of-life Node.js ranges covered by `engines.node` | `package.json` engines |

Do not add a lockfile or nested manifests here: the packed npm tarball must stay free of fixture manifests (`sc.tarball-fixtures`).
