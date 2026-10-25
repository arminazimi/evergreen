# GitLab component fixtures

Repositories the pipeline tests in `../pipeline.test.ts` run the `templates/evergreen.yml` job script against.

| Directory | Contents | Expected pipeline result |
| --- | --- | --- |
| `pass/` | `package.json` requiring a supported Node.js | Passes with no findings |
| `fail/` | `package.json` requiring end-of-life Node.js 18 and the deprecated `request` package | Fails at the default `high` gate; the report is kept |
| `baseline/` | The `fail/` manifest plus a baseline written by `evergreen baseline` | Passes with `baseline: .evergreen-baseline.json`, fails without it |
