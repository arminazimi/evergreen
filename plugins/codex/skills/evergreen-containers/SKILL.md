---
name: evergreen-containers
description: Find, explain, migrate, and verify end-of-life container base images in Dockerfiles, Containerfiles, and Compose files. Use when a FROM line or a Compose image names a release line that has reached vendor end of life. Do not use for image vulnerability scanning, image size or build-speed tuning, Kubernetes manifest review, or other ecosystems.
license: Apache-2.0
metadata:
  author: Evergreen
  version: "1"
---

# Evergreen for containers

This is the container entry point to the `evergreen-deprecation` workflow: discover, explain, migrate, verify. Lifecycle rules, evidence, and migration steps stay in Evergreen; this Skill only narrows what to ask for. It needs the Evergreen CLI or local MCP server and no account or API key. The container detector is experimental.

## Workflow

1. **Discover.** Run `evergreen scan . --json` and keep findings whose `ruleId` starts with `container.`. Choose one exact finding ID.
2. **Explain.** Run `evergreen explain '<finding-id>' . --json` and read the rule, location, and authoritative source before editing.
3. **Migrate.** Run `evergreen context '<finding-id>' . --json`. Change only the `FROM` lines and Compose `image:` entries the packet lists, and follow its constraints. Build the image afterwards; a new base can change system packages and default users.
4. **Verify.** Run the project's build and tests, then rescan and confirm the same rule and path are gone. With MCP, use `verify_migration` in the session that observed the finding.

With MCP, `scan_repository`, `explain_deprecation`, `create_migration_context`, and `verify_migration` map to the same steps.

## Limits

- Tags that are variables, `latest`, or a floating tag spanning supported and unsupported versions are reported as unclassified references, not findings. Do not guess a version for them.
- Only Docker Hub official images and Microsoft .NET images are matched; other registries are never judged.
- Treat suggested commands as suggestions and review them before running.
- An unknown ID after a rescan is not proof of success; compare rule and path.
