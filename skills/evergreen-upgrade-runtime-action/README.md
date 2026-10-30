# Evergreen upgrade runtime or Action

Use Evergreen when an agent upgrades an already-declared runtime or GitHub Action. The Skill maps that moment to scan, check, migrate, and verify commands and leaves lifecycle rules inside Evergreen.

## Install and update

Install from the Evergreen monorepo:

```bash
npx skills add arminazimi/evergreen --skill evergreen-upgrade-runtime-action --yes
```

Or install every Skill:

```bash
npx skills add arminazimi/evergreen
```

Update an existing installation:

```bash
npx skills update evergreen-upgrade-runtime-action
```

## Example requests

- “Upgrade our Node.js runtime to the current LTS.”
- “Bump actions/checkout and actions/setup-node.”
- “Migrate .nvmrc from Node 14 to a maintained LTS.”
- “Replace the sunset actions/cache@v1 with a supported version.”

Adding a new dependency belongs to `evergreen-check-before-add`. Whole-repository lifecycle discovery without an upgrade ask belongs to `evergreen-deprecation`.

## Execution path

The Skill needs either the local `evergreen-mcp` stdio server or the `evergreen` CLI on `PATH`. It contains instructions and evaluation data only: no executable Skill scripts, credentials, hooks, or pre-approved tools.

See the [Agent Skill guide](../../docs/AGENT_SKILLS.md) for trigger evaluation and limits.
