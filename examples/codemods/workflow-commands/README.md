# Workflow command migration

Copy `before.workflow.fixture` to `.github/workflows/demo.yml` in a temporary directory, then run `evergreen scan` and `evergreen fix --dry-run` there. The expected result is `after.workflow.fixture`. Fixture suffixes keep this demonstration out of normal scans.

The four stdout commands become appends to `GITHUB_OUTPUT`, `GITHUB_STATE`, `GITHUB_ENV`, and `GITHUB_PATH`. The environment-file path is always double-quoted. Single-quoted shell arguments keep their quoting to preserve literal values. Review the patch before running the workflow.
