# Target runtime lifecycle example

`.nvmrc`, a `Dockerfile` `FROM node:20-alpine`, and a `.tool-versions` line all pin Node.js 20. Moving to
Node.js 18 — itself end-of-life — is blocked, and every pin that would still need to change is listed:

```bash
evergreen upgrade-check --to nodejs@18 tests/fixtures/upgrade/target-lifecycle/example
```

```text
nodejs@18: blocked (1 blockers, 3 warnings, 0 unknown)
.nvmrc:1  nodejs@18  The target itself is end-of-life; choose Node.js 22 LTS or later.  [rule: nodejs.runtime.eol-18]
.nvmrc:1  pin to update  .nvmrc still pins Node.js 20; update it to the target 18.  [manifest: nvmrc: 20]
.tool-versions:1  pin to update  .tool-versions still pins Node.js 20.11.1; update it to the target 18.  [manifest: .tool-versions node: 20.11.1]
Dockerfile:1  pin to update  Dockerfile still pins Node.js node:20-alpine; update it to the target 18.  [manifest: FROM: node:20-alpine]
```

A move to a supported target only lists the files to change; the verdict stays `ready` and the command exits `0`:

```bash
evergreen upgrade-check --to nodejs@24 tests/fixtures/upgrade/target-lifecycle/example
```

```text
nodejs@24: ready (0 blockers, 3 warnings, 0 unknown)
.nvmrc:1  pin to update  .nvmrc still pins Node.js 20; update it to the target 24.  [manifest: nvmrc: 20]
.tool-versions:1  pin to update  .tool-versions still pins Node.js 20.11.1; update it to the target 24.  [manifest: .tool-versions node: 20.11.1]
Dockerfile:1  pin to update  Dockerfile still pins Node.js node:20-alpine; update it to the target 24.  [manifest: FROM: node:20-alpine]
```

Every file is parsed, never executed; the lifecycle verdict and the suggested line come only from the bundled
registry, and nothing is downloaded.
