# Workflow command migration

`examples/codemods/.github/workflows/workflow-commands.yml` is the input (workflow files are read only under the scanned root's own `.github/workflows`, so it sits at the top of `examples/codemods`); run `evergreen fix examples/codemods --dry-run` to see the patch. The expected result is `after.workflow.fixture`. GitHub only runs workflows under the repository root `.github/`, so this file never executes.

The four stdout commands become appends to `GITHUB_OUTPUT`, `GITHUB_STATE`, `GITHUB_ENV`, and `GITHUB_PATH`. The environment-file path is always double-quoted. Single-quoted shell arguments keep their quoting to preserve literal values. Review the patch before running the workflow.
