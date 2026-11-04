# Dockerfile legacy syntax codemod

`before.Dockerfile` uses the deprecated `MAINTAINER` instruction and the legacy space-separated `ENV key value` form. `after.Dockerfile` is what `evergreen fix` plans for it.

```bash
node dist/tools/examples.js codemods/dockerfile-legacy scan
node dist/tools/examples.js codemods/dockerfile-legacy fix --dry-run
```

The patch is printed as a diff. Nothing is written unless `fix --branch` is used.
