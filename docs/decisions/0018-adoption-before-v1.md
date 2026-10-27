# 0018 — Ship v0.8.0 (adoption) and v0.9.0 (visibility) before v1

Status: accepted

## Problem

Evergreen's engineering is ahead of its use. The repository has 0 stars, few external usage signals, and no outside contributors, while the roadmap went straight from feature phases to v1 hardening (Phase 37) and only then to proof (Phase 38), growth (Phase 39), and open data and contributors (Phase 40).

v1 is a compatibility promise. Making it before anyone outside the project has used Evergreen means freezing interfaces on guesses. Growth work placed after v1 also means v1 launches to nobody.

External scorecards add urgency. Socket reports Critical and High CVEs and deprecated packages against `evergreen-deprecation` 0.6.1. These come from a demo fixture shipped in the tarball (`examples/demo/package.json` declares `request@2.88.2`), not from Evergreen's runtime dependencies, which `npm audit` reports clean. A deprecation tool that is flagged as using deprecated packages loses trust before anyone runs it.

## Decision

1. **Two releases come before v1, in this order.**
   - **v0.8.0 — Adoption:** get Evergreen used, by people and by agents. Clean external scores, the documentation site on Slipway with every URL preserved, a short README with reproducible demos, a first run that works from the published package, agent install paths and daily-loop setups, starter kits for common stacks, organization-wide rollout, dogfooding in the maintainer's other repositories, pipeline integrations, and five pilot users.
   - **v0.9.0 — Visibility:** get Evergreen known. Contributor onboarding and a steady supply of good first issues, launches and recurring content, open data and lookup, presence in directories, search discoverability, proof, and public metrics.
2. **Usage comes before visibility.** Sending visitors to a product that fails on first run spends attention without keeping users.
3. **Phases 38–40 are merged into these releases.** Their open issues move into v0.8.0 or v0.9.0, and the milestones are closed once empty. Phase 37 stays the v1 hardening phase and moves after v0.9.0.
4. **Ideas that are not needed before v1 are recorded as unscheduled epics** in an _After v1 — Future_ milestone: a local in-browser playground, shareable outputs, feedback capture, a Rule-a-thon, talks, standards presence, and translations. Their tasks are written when an epic starts.
5. **Stars are a signal, not the goal.** v0.9.0 reports stars next to external contributors with merged PRs and repeat users measured from public signals. No telemetry is added to reach these numbers.

## Consequences

- The first task of v0.8.0 is keeping fixture manifests out of the npm tarball, followed by a 0.7.1 release, so the Socket report is clean before any outreach.
- The documentation site migration depends on Slipway having a usable release. Its first task is marked blocked until then, and the rest of v0.8.0 does not wait for it.
- v0.8.0 is large. Scorecards, the README, first run, and agent install paths are release-blocking. Starter kits, organization rollout, and dogfooding may ship partly in v0.8.x.
- Local-first and no-telemetry constraints are unchanged.
