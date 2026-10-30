# Upgrade check

`evergreen upgrade-check --to <runtime@version> [path] [--json]` answers, offline and from files already in the repository, whether a project can move to a target runtime. It lists each blocker, warning, and unknown with the exact lockfile or manifest entry behind it. Agents get the same answer through the `check_upgrade` MCP tool.

```bash
evergreen upgrade-check --to php@8.4 .
evergreen upgrade-check --to nodejs@22 . --json
```

The text output starts with the verdict, then one line per issue:

```text
php@8.4: unknown (0 blockers, 0 warnings, 0 unknown)
Evergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe.
```

The JSON output is an `evergreen.upgrade.v1` document that conforms to [`schemas/upgrade.v1.schema.json`](../schemas/upgrade.v1.schema.json). Exit codes: `1` when the verdict is `blocked`, `0` for `ready` and `unknown`, `2` for bad input.

An analyzer only runs when the repository has the files it reads. Each issue names its analyzer, its level (`blocker`, `warning`, or `unknown`), the affected subject, the path and line, and the evidence value exactly as written.

- `blocker`: the project will not install or run on the target.
- `warning`: it works but is deprecated on the target.
- `unknown`: the evidence needed to judge it is missing.

Each analyzer has a section below, added by the task that ships it.

## What it cannot know

- **Native extensions and build-time requirements.** A package may fail to build on the target for reasons its metadata does not state.
- **Packages without declared support ranges.** If a package never declares which runtime it supports, the analyzer reports `unknown` or nothing, never `ready` by assumption.
- **Code paths outside the source.** Dynamic loading, `eval`, generated code, and behavior that only appears at runtime are not visible here.
- **Your CI images and operating system.** The runtime inside a container image or on a runner is not part of this check.
- **Unresolved dependencies.** When a lockfile does not record a support range for a package, no analyzer can judge that package.
- **Anything at install time.** Evergreen never runs a package manager, compiler, or test suite, and no scan uses the network.

An `unknown` verdict means Evergreen found no evidence for that runtime in this repository. It is not a statement that the upgrade is safe.
