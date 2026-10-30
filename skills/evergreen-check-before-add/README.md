# Evergreen check-before-add

Use Evergreen at the moment an agent adds or chooses a package, runtime, or GitHub Action. The Skill maps that intent to `check_dependency` (or `evergreen check`) and leaves lifecycle rules inside Evergreen.

## Install and update

Install from the Evergreen monorepo:

```bash
npx skills add arminazimi/evergreen --skill evergreen-check-before-add --yes
```

Or install both Skills:

```bash
npx skills add arminazimi/evergreen
```

Update an existing installation:

```bash
npx skills update evergreen-check-before-add
```

## Example requests

- “Add the request package to this project.”
- “npm install left-pad and use it for padding.”
- “Which package should I use for date handling?”
- “Add actions/checkout@v4 to the CI workflow.”

Repository lifecycle scans, finding migration, verification, routine upgrades of already-declared dependencies, and removals belong to other workflows (see `evergreen-deprecation`).

## Execution path

The Skill needs either the local `evergreen-mcp` stdio server or the `evergreen` CLI on `PATH`. It contains instructions and evaluation data only: no executable Skill scripts, credentials, hooks, or pre-approved tools.

See the [Agent Skill guide](../../docs/AGENT_SKILLS.md) for trigger evaluation and limits.
