---
name: evergreen-nodejs
description: Find, explain, migrate, and verify end-of-life Node.js runtimes and deprecated npm packages in a repository, and check an npm package or Node.js version against lifecycle data before adding it. Use for package.json engines, .nvmrc, .node-version, and lockfile lifecycle risks. Do not use for routine npm upgrades, npm audit or vulnerability work, deprecated JavaScript APIs in source, or other ecosystems.
license: Apache-2.0
metadata:
  author: Evergreen
  version: "1"
---

# Evergreen for Node.js and npm

This is the Node.js and npm entry point to the `evergreen-deprecation` workflow: discover, explain, migrate, verify. Lifecycle rules, evidence, and migration steps stay in Evergreen; this Skill only narrows what to ask for. It needs the Evergreen CLI or local MCP server and no account or API key.

## Workflow

1. **Discover.** Run `evergreen scan . --json` and keep findings whose `ruleId` starts with `nodejs.` (runtime versions) or `npm.` (packages). Choose one exact finding ID.
2. **Explain.** Run `evergreen explain '<finding-id>' . --json` and read the rule, location, and authoritative source before editing.
3. **Migrate.** Run `evergreen context '<finding-id>' . --json`. Change only the declaration and usages the packet lists, such as `engines.node`, `.nvmrc`, or the imports of a replaced package, and follow its behavioral constraints.
4. **Verify.** Run the project's tests, then rescan and confirm the same rule and path are gone. With MCP, use `verify_migration` in the session that observed the finding.

With MCP, `scan_repository`, `explain_deprecation`, `create_migration_context`, and `verify_migration` map to the same steps.

## Before adding an npm package or Node.js version

Run `evergreen check pkg:npm/<name>@<version>` (or `check_dependency`) first. Prefer the cited replacement when the result is `affected`. `no-data` means Evergreen has no rule for the package; it is not a claim that the package is safe.

## Limits

- Raising a Node.js floor changes which runtimes the project supports; present that change instead of making it silently.
- Treat suggested commands as suggestions and review them before running.
- An unknown ID after a rescan is not proof of success; compare rule and path.
- Report unsupported or dynamic references as limitations instead of guessing.
