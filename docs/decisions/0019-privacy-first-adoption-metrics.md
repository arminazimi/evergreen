# 0019 — Privacy-first adoption metrics; opt-in telemetry only after v1

Status: accepted

## Problem

v0.9.0 needs a clear picture of whether Evergreen is used, without turning the product into something that phones home. Adoption numbers that require scanning users' repositories, identifying people, or sending scan results to an Evergreen service would break the local-first promise in [PRIVACY.md](../PRIVACY.md) and the trust rules in [AGENTS.md](../../AGENTS.md).

At the same time, "no telemetry ever" and "we cannot measure anything" are different claims. Public package registries, marketplace listings, and code search already publish counts anyone can reproduce. A later, carefully scoped opt-in signal might still be useful after v1 — but only if the default stays off, the fields are tightly bounded, and scans never gain network access to collect it.

Without a written decision, later work either invents telemetry under pressure for stars and downloads, or freezes measurement so thinly that v0.9.0 cannot report progress honestly.

## Decision

1. **Telemetry is off by default, forever as the default.** The published CLI, MCP server, GitHub Action, Agent Skill, and plugins send nothing about how they are used unless a future, explicit opt-in is designed and shipped under a separate decision after v1. The local usage log (`EVERGREEN_USAGE_LOG`) stays local-only and is never uploaded; it is not product telemetry.

2. **Public package and marketplace metrics come first.** Through v1, adoption is measured only from public sources that a maintainer (or anyone else) can reproduce without user consent: npm download counts, MCP Registry and skills.sh listings, GitHub stars/forks and code-search hits for the Action / pre-commit / GitLab component, OpenSSF Scorecard and similar public score pages, GoatCounter pageviews for the docs site when its public visitor counter is enabled, and external contributors with merged pull requests. The maintainer tool and metric definitions live in [ADOPTION.md](../ADOPTION.md) and `tools/adoption-metrics.ts`. Those tools are never part of a scan or of `npm run check`.

3. **Allowed and forbidden fields for any future opt-in telemetry.** If a post-v1 design adds opt-in product telemetry, it may collect only aggregate, non-identifying product signals, and only after the user or operator turns it on. The allow-list and deny-list below are the contract; a follow-up ADR may narrow them further but must not widen them without revisiting this decision.

   **Allowed (opt-in only, after v1):**
   - Evergreen version and distribution channel (npm, Action, MCP, Skill, plugin host name).
   - Command or surface name (`scan`, `check`, `mcp`, Action, …) and high-level outcome class (success, usage error, policy failure, …) without finding payloads.
   - Counts of findings by severity and by detector id (not rule ids tied to a private codebase, not file paths).
   - A coarse, non-identifying environment class (CI vs local; OS family such as `linux` / `darwin` / `win32`) when needed to interpret crashes or support load.
   - An install- or session-scoped random identifier that rotates and is not derived from machine, user, or repository identity.

   **Forbidden (always):**
   - Repository contents, file paths, source excerpts, finding messages, Package URLs from the scanned tree, baselines, or migration packets.
   - Repository names, remote URLs, organization names, usernames, emails, hostnames, IP addresses, or any stable device fingerprint.
   - Prompts, agent transcripts, API keys, tokens, or environment variable values.
   - Automatic or default-on collection; silent upgrades that enable telemetry; bundling telemetry into `evergreen data update` or into scan/MCP paths.
   - Any network call from `scan`, `check`, `explain`, `context`, `forecast`, `baseline`, `doctor`, `mcp`, or the Action's scan step for the purpose of metrics.

4. **Implementation is out of scope until after v1.** No SDK, CLI flag, config key, endpoint, or schema for product telemetry ships in v0.8.x, v0.9.x, or v1. Roadmap work that needs numbers uses the public metrics path in decision 2. A post-v1 epic may propose a concrete design that obeys decision 3; shipping it requires updating [PRIVACY.md](../PRIVACY.md) and [ADOPTION.md](../ADOPTION.md) in the same change, and must not add network access to scans.

## Alternatives considered

- **Add opt-in telemetry before v1 to learn faster.** Rejected: v1 is a compatibility and trust promise; shipping a phone-home path before the public-metrics baseline is proven invites scope creep and weakens the local-first story used in every channel submission.
- **Ban all future telemetry in this ADR.** Rejected as over-commitment: aggregate, opt-in crash or command-mix signals can help maintainers after v1 without reading repositories. The forbid list keeps that door from becoming a surveillance channel.
- **Infer adoption only from stars.** Rejected: [decision 0018](0018-adoption-before-v1.md) already treats stars as a signal, not the goal; public install and CI-reference counts are stronger and still telemetry-free.

## Consequences

- v0.9.0 visibility work reports adoption from committed snapshots under `metrics/adoption/` and from public registries, not from client-side analytics.
- Copy that says Evergreen has "no telemetry" remains accurate through v1: there is no product telemetry path to turn on. If a post-v1 opt-in ships, that wording becomes "off by default; opt-in only" and must be updated with the implementation.
- Scans stay offline. Maintainer-only network use for adoption snapshots and for `evergreen data update` is unchanged and still sends nothing about scanned repositories.
- Follow-up issues may extend public metric sources (new marketplaces, Orb registries, and so on). They must not add client telemetry under this issue's cover.
