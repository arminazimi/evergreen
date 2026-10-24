---
name: evergreen-github-actions
description: Find, explain, migrate, and verify deprecated GitHub Actions and end-of-life runners or runtimes in workflow files, and check an action before adding it to a workflow. Use for uses lines in .github/workflows and reusable workflows. Do not use for writing new workflows, CI speed-ups, vulnerability or security audits of workflows, or other ecosystems.
license: Apache-2.0
metadata:
  author: Evergreen
  version: "1"
---

# Evergreen for GitHub Actions

This is the GitHub Actions entry point to the `evergreen-deprecation` workflow: discover, explain, migrate, verify. Lifecycle rules, evidence, and migration steps stay in Evergreen; this Skill only narrows what to ask for. It needs the Evergreen CLI or local MCP server and no account or API key.

## Workflow

1. **Discover.** Run `evergreen scan . --json` and keep findings whose `ruleId` starts with `github-actions.`. Choose one exact finding ID.
2. **Explain.** Run `evergreen explain '<finding-id>' . --json` and read the rule, location, and authoritative source before editing.
3. **Migrate.** Run `evergreen context '<finding-id>' . --json`. Change only the `uses:` lines and workflow files the packet lists, and follow its constraints. Read the action's release notes for renamed or removed inputs before bumping a major version.
4. **Verify.** Rescan and confirm the same rule and path are gone, then let the workflow run on a branch. With MCP, use `verify_migration` in the session that observed the finding.

With MCP, `scan_repository`, `explain_deprecation`, `create_migration_context`, and `verify_migration` map to the same steps.

## Before adding an action

Run `evergreen check pkg:github/<owner>/<name>@<version>` (or `check_dependency`) first. Prefer the cited replacement when the result is `affected`. `no-data` means Evergreen has no rule for the action; it is not a claim that the action is safe.

## Limits

- Keep an existing commit-SHA pin as a SHA pin when bumping; do not replace it with a tag.
- Treat suggested commands as suggestions and review them before running.
- An unknown ID after a rescan is not proof of success; compare rule and path.
- Report unsupported or dynamic references as limitations instead of guessing.
