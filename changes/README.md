# Changelog fragments

A pull request that changes user-visible behavior adds one file here instead of editing `CHANGELOG.md`. Two pull requests that each add a fragment never touch the same lines, so they never conflict.

- One file per change, named for the change in lowercase words, for example `github-action-sha-pins.md`.
- The file holds exactly one line: a changelog bullet that starts with `- ` and reads as an imperative sentence, with the pull request number when there is one, for example `- Classify SHA pins in the GitHub Action. (#560)`.
- Do not add a fragment for `docs`, `test`, `ci`, `chore`, `build`, `refactor`, or `style` changes.
- Write any mention such as `@name` or `@org/team` inside backticks; the tool quotes a bare one, so it never notifies anyone on GitHub.

At release, `node dist/tools/changelog.js --write X.Y.Z --date YYYY-MM-DD` puts every fragment into the new version section, in file-name order, and deletes the files. See [docs/RELEASING.md](../docs/RELEASING.md).
