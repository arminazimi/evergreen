---
trigger: always_on
description: Check a dependency with Evergreen before adding it
---

# Evergreen dependency check

Before you add a new package, runtime, or GitHub Action to this project, or pick one to replace another, check it with Evergreen.

- Call the `check_dependency` tool with a Package URL, for example `pkg:npm/request@2.88.2`, `pkg:pypi/nose`, or `pkg:github/actions/checkout@v4`. Without MCP, run `npx evergreen-deprecation check <purl>`.
- If the status is `affected`, prefer the replacement it names and tell the user why, citing the evidence links it returns.
- `version-dependent` means rules exist only for some versions: call again with the version you intend to use. `no-data` means Evergreen has no rule for that package; it is not a claim that the package is safe.
- Do not use Evergreen for security vulnerability audits or for routine upgrades of dependencies the project already uses.
