# Contributing to Evergreen

Thanks for helping make software lifecycle changes easier to discover and migrate.

## Choose a contribution

- Bug reports should include a minimal repository fixture, the command used, actual output, and expected output.
- New lifecycle rules need an authoritative maintainer or platform source, a precise matching contract, migration guidance, and true/false-positive tests.
- New detectors should begin with a focused proposal describing the ecosystem declarations, lockfiles, evidence sources, and boundaries.
- Documentation and reproducible corpus improvements are welcome without prior discussion.

Look for issues labeled `good first issue` or `help wanted`. For larger changes, open a proposal before implementation so the detector seam and v0.1 non-goals stay clear.

## Development

Coding agents and people working with them should read [AGENTS.md](AGENTS.md) first.

Requirements: Node.js 22 or newer.

```bash
npm ci
npm run check
```

Add tests for observable behavior and keep JSON output deterministic. Registry changes must preserve the documented schema and include evidence-backed migration guidance. Do not add network calls to the scan path or execute migration commands automatically.

The public-repository validation corpus is intentionally not part of the normal CI gate because it requires network access. Run it when changing detector behavior:

```bash
npm run validate:public-repos
```

## Pull requests

Keep each pull request focused. Explain the lifecycle source, user-visible behavior, tests, and any known limitations. Run `npm run check` before requesting review and avoid reformatting unrelated files.

By contributing, you agree that your contribution is licensed under the repository's Apache-2.0 license.
