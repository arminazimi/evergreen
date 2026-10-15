# Evergreen plugin for Claude

Evergreen's Claude plugin packages the canonical lifecycle Skill with the same version-pinned local MCP server used by the Codex adapter. It does not fork detectors, migration logic, or verification behavior.

## Requirements

- Claude Code 2.1.292 or newer for the one-command marketplace install shown below.
- Node.js 22 or newer for the local Evergreen MCP server.

## Install

Install directly from Evergreen's GitHub marketplace:

```sh
claude plugin install evergreen --marketplace arminazimi/evergreen
```

For older Claude Code versions, add the marketplace and install in two steps:

```sh
claude plugin marketplace add arminazimi/evergreen
claude plugin install evergreen@evergreen
```

Choose a scope when needed:

```sh
claude plugin install evergreen@evergreen --scope user
claude plugin install evergreen@evergreen --scope project
claude plugin install evergreen@evergreen --scope local
```

User scope enables Evergreen for you on this machine. Project scope records it in the repository's `.claude/settings.json` for collaborators. Local scope enables it only for you in the current repository.

For development without installing, load the adapter directory for one session:

```sh
claude --plugin-dir ./plugins/claude
```

## Confirm

```sh
claude plugin list
claude plugin details evergreen
```

The installed plugin exposes the `evergreen-deprecation` Skill and the local `evergreen` MCP server. Scan, list, explain, context, and verify behavior is checked against the Codex adapter by `npm run eval:plugins`.

## Update

```sh
claude plugin update evergreen@evergreen
```

The marketplace has automatic updates off by default. You can manage that setting from the Marketplaces tab in `/plugin`.

## Disable and re-enable

```sh
claude plugin disable evergreen@evergreen
claude plugin enable evergreen@evergreen
```

Disabling stops the Skill and MCP server from loading but keeps the installed files and settings.

## Remove

```sh
claude plugin uninstall evergreen@evergreen
```

If it was installed at project scope, add `--scope project`. To remove the marketplace after uninstalling its plugin:

```sh
claude plugin marketplace remove evergreen
```

## Public directory submission

The public Claude directory submission uses:

- Repository: `https://github.com/arminazimi/evergreen`
- Plugin path: `plugins/claude`
- Tracked branch: `main`
- Submission type: Plugin bundle

The submitter must connect a GitHub account with push access, answer Anthropic's data-handling and compliance questions, and submit from the [Claude developer portal](https://claude.ai/directory/manage). The local package is prepared for that review with a manifest, README, Apache-2.0 license, exact npm runtime pin, strict Claude validation, and the repository security/evaluation evidence in [Plugin host evaluation](PLUGIN_EVALS.md).
