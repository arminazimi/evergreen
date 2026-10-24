---
name: evergreen-python
description: Find, explain, migrate, and verify end-of-life Python versions and deprecated Python packages in a repository, and check a PyPI package or Python version against lifecycle data before adding it. Use for requires-python, pyproject.toml, requirements files, and lockfile lifecycle risks. Do not use for routine pip upgrades, vulnerability or security audits, deprecated Python language features in source, or other ecosystems.
license: Apache-2.0
metadata:
  author: Evergreen
  version: "1"
---

# Evergreen for Python

This is the Python entry point to the `evergreen-deprecation` workflow: discover, explain, migrate, verify. Lifecycle rules, evidence, and migration steps stay in Evergreen; this Skill only narrows what to ask for. It needs the Evergreen CLI or local MCP server and no account or API key.

## Workflow

1. **Discover.** Run `evergreen scan . --json` and keep findings whose `ruleId` starts with `python.`. Choose one exact finding ID.
2. **Explain.** Run `evergreen explain '<finding-id>' . --json` and read the rule, location, and authoritative source before editing.
3. **Migrate.** Run `evergreen context '<finding-id>' . --json`. Change only the declaration and usages the packet lists, such as `requires-python`, a classifier, a requirements entry, or the imports of a replaced package, and follow its behavioral constraints.
4. **Verify.** Run the project's tests, then rescan and confirm the same rule and path are gone. With MCP, use `verify_migration` in the session that observed the finding.

With MCP, `scan_repository`, `explain_deprecation`, `create_migration_context`, and `verify_migration` map to the same steps.

## Before adding a Python package or version

Run `evergreen check pkg:pypi/<name>@<version>` (or `check_dependency`) first. Prefer the cited replacement when the result is `affected`. `no-data` means Evergreen has no rule for the package; it is not a claim that the package is safe.

## Limits

- Raising a Python floor changes which interpreters the library supports; present that change instead of making it silently.
- Treat suggested commands as suggestions and review them before running.
- An unknown ID after a rescan is not proof of success; compare rule and path.
- Report unsupported or dynamic references as limitations instead of guessing.
