# Roadmap

**Evergreen H1 — Coverage & Proof** · 2026-10-15 → 2027-04-15 · 22 phases, each its own milestone, run in order · [project board](https://github.com/users/arminazimi/projects/3)

> This file is generated from `planning/roadmap/` by `node planning/roadmap/roadmap-md.mjs`. Edit the data, not this file.
> Scope changes still require an explicit decision recorded in `docs/decisions/`.

## Direction

Evergreen's engineering is ahead of its data and its evidence. For the next six months the order is:

1. **Content before new surfaces.** Lifecycle rules are generated from authoritative machine-readable sources and reviewed, not hand-written one by one.
2. **Independent proof.** Accuracy is measured against ground truth Evergreen did not write: real migration commits, upstream changelogs, and differential testing.
3. **Agent-native by default.** Agents check dependencies as they add them, and every push can run Evergreen through hooks.
4. **Standards, not a new format.** Rules are keyed by PURL and VERS and exported as CLE (ECMA-428) and CycloneDX lifecycle data.
5. **Grow inside existing workflows.** Evergreen ships into pipelines people already run and launches every phase, not once.

The long-term goal is for Evergreen to be the first lifecycle reference agents and DevOps teams reach for. This roadmap builds the foundation: open evidence, standard formats, and presence in every common pipeline.

## v1 targets

| Measure | Today | Target |
|---|---|---|
| Ecosystems and platforms detected | 4 | 25+ (12 stable, the rest experimental) |
| Lifecycle signals imported with evidence | 0 | 3,000+ |
| Curated rules with migration packets | 15 | 300+ |
| Symbol-level API deprecation rules | 0 | 100+ |
| Independent ground-truth corpus | 20 repositories, self-defined | 300 repositories, ground truth not authored by Evergreen |
| Precision per stable detector | 1.0 against own rules | ≥ 0.95 against independent ground truth |
| Data freshness | tied to package releases | ≤ 7 days through a signed data channel |
| Distribution | npm, skills.sh | + MCP Registry, GitHub Marketplace, GitLab Catalog, Docker, Homebrew, pre-commit, MegaLinter, VS Code, Claude, Codex |
| External contributors with merged PRs | 0 | 15+ |

## Phases

Each phase is a GitHub milestone. A phase starts when the previous one is complete, and no task depends on a later phase.

| Phase | Window | Issues |
|---|---|---|
| [Phase 20 — Ready for contributors and real data](https://github.com/arminazimi/evergreen/milestone/12) | 2026-10-15 → 2026-11-15 | 71 |
| [Phase 21 — Fresh data and agent guardrails](https://github.com/arminazimi/evergreen/milestone/13) | 2026-11-16 → 2026-12-15 | 61 |
| [Phase 21.5 — Release 0.2: ship what is built](https://github.com/arminazimi/evergreen/milestone/18) | 2026-10-17 → 2026-10-31 | 26 |
| [Phase 22 — Backend, cloud, and Kubernetes coverage](https://github.com/arminazimi/evergreen/milestone/14) | 2026-12-16 → 2027-01-15 | 95 |
| [Phase 23 — Standards and precise code analysis](https://github.com/arminazimi/evergreen/milestone/15) | 2027-01-16 → 2027-02-15 | 60 |
| [Phase 24 — Community ecosystems and open data](https://github.com/arminazimi/evergreen/milestone/16) | 2027-02-16 → 2027-03-15 | 71 |
| [Phase 25 — Evergreen v1](https://github.com/arminazimi/evergreen/milestone/17) | 2027-03-16 → 2027-04-15 | 4 |
| [Phase 26 — Evergreen checks itself](https://github.com/arminazimi/evergreen/milestone/19) | 2026-10-23 → 2026-11-12 | 6 |
| [Phase 27 — Trust and accuracy](https://github.com/arminazimi/evergreen/milestone/20) | 2026-11-13 → 2026-12-03 | 11 |
| [Phase 28 — Data freshness](https://github.com/arminazimi/evergreen/milestone/21) | 2026-12-04 → 2026-12-24 | 7 |
| [Phase 29 — Agent-native](https://github.com/arminazimi/evergreen/milestone/22) | 2026-12-25 → 2027-01-14 | 11 |
| [Phase 30 — Personal use](https://github.com/arminazimi/evergreen/milestone/23) | 2027-01-15 → 2027-02-04 | 11 |
| [Phase 31 — Forecast and planning](https://github.com/arminazimi/evergreen/milestone/24) | 2027-02-05 → 2027-02-25 | 9 |
| [Phase 32 — Fix and automation](https://github.com/arminazimi/evergreen/milestone/25) | 2027-02-26 → 2027-03-18 | 7 |
| [Phase 33 — Team and DevOps](https://github.com/arminazimi/evergreen/milestone/26) | 2027-03-19 → 2027-04-08 | 22 |
| [Phase 34 — Editor and guard](https://github.com/arminazimi/evergreen/milestone/27) | 2027-04-09 → 2027-04-29 | 6 |
| [Phase 35 — Coverage: cloud, OS, and runtimes](https://github.com/arminazimi/evergreen/milestone/28) | 2027-04-30 → 2027-05-20 | 12 |
| [Phase 36 — Interop and standards](https://github.com/arminazimi/evergreen/milestone/29) | 2027-05-21 → 2027-06-10 | 12 |
| [Phase 37 — Evergreen v1 hardening](https://github.com/arminazimi/evergreen/milestone/30) | 2027-06-11 → 2027-07-01 | 16 |
| [Phase 38 — Proof](https://github.com/arminazimi/evergreen/milestone/31) | 2027-07-02 → 2027-07-22 | 8 |
| [Phase 39 — Growth](https://github.com/arminazimi/evergreen/milestone/32) | 2027-07-23 → 2027-08-12 | 21 |
| [Phase 40 — Open data and contributors](https://github.com/arminazimi/evergreen/milestone/33) | 2027-08-13 → 2027-09-02 | 12 |

## How work is organized

Every roadmap issue belongs to one phase milestone and is small enough for one pull request. Labels say who it suits:

| Label | Meaning |
|---|---|
| `lane: strong-agent` | Codex or Claude (or an experienced contributor) |
| `lane: free-agent` | Freebuff, Kilo Code, or any contributor |
| `lane: maintainer` | Maintainer only (accounts, submissions, releases, outreach) |
| `size: XS` / `S` / `M` | Under an hour / a few hours / about a day |
| `good first issue` | A complete brief, isolated change, and fixtures — a good first contribution |
| `type: epic` | Tracking issue that lists its tasks |

Pick any open task whose dependencies are closed. Each task includes an agent brief with files, steps, commands, and a done-check. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Phase 20 — Ready for contributors and real data

_2026-10-15 → 2026-11-15 · 68 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/12)_

**When this phase is complete, Evergreen has:**

- AGENTS.md, issue forms, PR template, CODEOWNERS, dev container, and a 30-minute first-contribution path
- Lifecycle rule format v2 keyed by PURL and VERS, with provenance and freshness; all bundled registries migrated
- SHA-pinned GitHub Actions classified instead of silently ignored
- Importer framework plus importers for Node.js, Python, npm, PyPI, GitHub Actions runtimes, and runner images
- Independent ground truth from real migration commits; 10 new GitHub Actions corpus repositories; weekly corpus runs
- Shared detector conformance suite run by every built-in detector
- CI on Linux, Windows, and macOS with Node 22 and 24; npm trusted publishing with provenance
- 40+ new curated npm, Python, and GitHub Actions rules; weekly adoption measurement

**Epics**

- **[Make the repository agent- and contributor-ready](https://github.com/arminazimi/evergreen/issues/67)** — Let four coding agents and new contributors work in parallel safely, one small issue per PR. _(9 tasks)_
- **[Lifecycle rule format v2 (PURL, VERS, provenance, freshness)](https://github.com/arminazimi/evergreen/issues/38)** — Key every lifecycle rule by PURL and VERS with auditable provenance so rules can be imported, exported as CLE, and checked for freshness. _(16 tasks)_
- **[Classify SHA-pinned GitHub Actions](https://github.com/arminazimi/evergreen/issues/68)** — Security-focused teams pin actions to commit SHAs; today those references are silently unclassified. Classify them deterministically. _(5 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Define the lifecycle importer interface](https://github.com/arminazimi/evergreen/issues/118)
  - [Add offline recording and replay for importer tests](https://github.com/arminazimi/evergreen/issues/119)
  - [Diff draft rules against the registry](https://github.com/arminazimi/evergreen/issues/120)
  - [Generate a reviewable PR body with an evidence table](https://github.com/arminazimi/evergreen/issues/121)
  - [Document how to write an importer](https://github.com/arminazimi/evergreen/issues/123)
  - [Importer: Node.js release schedule](https://github.com/arminazimi/evergreen/issues/124)
  - [Importer: Python release cycle](https://github.com/arminazimi/evergreen/issues/125)
  - [Importer: npm `deprecated` metadata for direct dependencies](https://github.com/arminazimi/evergreen/issues/126)
  - [Importer: PyPI project status markers (PEP 792)](https://github.com/arminazimi/evergreen/issues/127)
  - [Importer: GitHub Actions runtime deprecations (Node runtimes in action.yml)](https://github.com/arminazimi/evergreen/issues/128)
  - [Importer: GitHub-hosted runner image retirements](https://github.com/arminazimi/evergreen/issues/129)
  - [Add `groundTruthSource` to the validation corpus schema](https://github.com/arminazimi/evergreen/issues/131)
  - [Define migration-commit mining queries](https://github.com/arminazimi/evergreen/issues/132)
  - [Mine candidate migration commits into review files](https://github.com/arminazimi/evergreen/issues/133)
  - [Add a reviewed/rejected log for corpus candidates](https://github.com/arminazimi/evergreen/issues/134)
  - [Add 10 GitHub Actions repositories to the corpus](https://github.com/arminazimi/evergreen/issues/135)
  - [Schedule the pinned public-repository validation corpus](https://github.com/arminazimi/evergreen/issues/16)
  - [Build the detector conformance harness](https://github.com/arminazimi/evergreen/issues/146)
  - [Conformance check: determinism](https://github.com/arminazimi/evergreen/issues/147)
  - [Conformance check: locations](https://github.com/arminazimi/evergreen/issues/148)
  - [Conformance check: evidence](https://github.com/arminazimi/evergreen/issues/149)
  - [Conformance check: zero](https://github.com/arminazimi/evergreen/issues/150)
  - [Conformance check: malformed](https://github.com/arminazimi/evergreen/issues/151)
  - [Conformance check: bounds](https://github.com/arminazimi/evergreen/issues/152)
  - [Run every built-in detector through conformance](https://github.com/arminazimi/evergreen/issues/153)
  - [Export the conformance harness from the SDK](https://github.com/arminazimi/evergreen/issues/154)
  - [Run the core test suite on Windows](https://github.com/arminazimi/evergreen/issues/17)
  - [Add macOS to the CI matrix](https://github.com/arminazimi/evergreen/issues/157)
  - [Test on Node.js 24 in CI](https://github.com/arminazimi/evergreen/issues/158)
  - [Automate changelog and release notes](https://github.com/arminazimi/evergreen/issues/161)
  - [Add a release checklist](https://github.com/arminazimi/evergreen/issues/162)
  - [Add 10 curated npm package lifecycle rules (batch 1)](https://github.com/arminazimi/evergreen/issues/163)
  - [Add 10 curated npm package lifecycle rules (batch 2)](https://github.com/arminazimi/evergreen/issues/164)
  - [Add 10 curated Python package lifecycle rules (batch 1)](https://github.com/arminazimi/evergreen/issues/167)
  - [Add 10 curated Python package lifecycle rules (batch 2)](https://github.com/arminazimi/evergreen/issues/168)
  - [Add 10 curated GitHub Actions lifecycle rules (batch 1)](https://github.com/arminazimi/evergreen/issues/170)
  - [Add 10 curated GitHub Actions lifecycle rules (batch 2)](https://github.com/arminazimi/evergreen/issues/171)
  - [Measure adoption weekly without telemetry](https://github.com/arminazimi/evergreen/issues/283)

## Phase 21 — Fresh data and agent guardrails

_2026-11-16 → 2026-12-15 · 57 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/13)_

**When this phase is complete, Evergreen has:**

- Signed lifecycle data bundle with `evergreen data update` and `evergreen data status`; scans stay offline
- Agent guardrail: `evergreen check`, the `check_dependency` MCP tool, and hooks for Claude Code and Codex, with setups for Cursor, Gemini CLI, Copilot, and Kilo Code
- MCP resources, prompts, and typed outputs; listing in the official MCP Registry; llms.txt
- `evergreen init --agents --hooks` with a git pre-push hook and a pre-commit hook
- SARIF output and GitHub Code Scanning upload
- Detector scaffolding generator; Go and container base-image detection
- Scheduled importers opening data PRs; differential testing against Renovate and xeol; 50-repository corpus
- First public launch: the agent dependency guardrail

**Epics**

- **[Detector scaffolding generator](https://github.com/arminazimi/evergreen/issues/42)** — Reduce a new ecosystem detector to one command and a predictable, reviewable structure. _(5 tasks)_
- **[Richer MCP surface: resources, prompts, structured outputs](https://github.com/arminazimi/evergreen/issues/74)** — Expose rules and findings as MCP resources, migrations as prompts, and typed outputs for every tool. _(5 tasks)_
- **[SARIF and native CI reporting](https://github.com/arminazimi/evergreen/issues/35)** — Expose findings through code-scanning interfaces without losing the canonical JSON report. _(5 tasks)_
- **[Container base images lifecycle detection](https://github.com/arminazimi/evergreen/issues/15)** — Detect evidence-backed Container base images lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(10 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Importer: endoflife.date adapter with mandatory vendor sources](https://github.com/arminazimi/evergreen/issues/130)
  - [Differential testing against Renovate deprecation output](https://github.com/arminazimi/evergreen/issues/136)
  - [Grow the independent corpus to 50 repositories](https://github.com/arminazimi/evergreen/issues/140)
  - [Separate checkout time from scan time in benchmark results](https://github.com/arminazimi/evergreen/issues/143)
  - [Add 10 curated npm package lifecycle rules (batch 3)](https://github.com/arminazimi/evergreen/issues/165)
  - [Add 10 curated npm package lifecycle rules (batch 4)](https://github.com/arminazimi/evergreen/issues/166)
  - [Add 10 curated Python package lifecycle rules (batch 3)](https://github.com/arminazimi/evergreen/issues/169)
  - [Define the lifecycle data bundle format](https://github.com/arminazimi/evergreen/issues/178)
  - [Build the data bundle in CI](https://github.com/arminazimi/evergreen/issues/179)
  - [Verify bundle signatures before loading](https://github.com/arminazimi/evergreen/issues/181)
  - [Add `evergreen data update`](https://github.com/arminazimi/evergreen/issues/182)
  - [Add `evergreen data status`](https://github.com/arminazimi/evergreen/issues/183)
  - [Pin a data bundle version in config](https://github.com/arminazimi/evergreen/issues/184)
  - [Guarantee offline behavior of scans](https://github.com/arminazimi/evergreen/issues/185)
  - [Show data age and stale warnings in all outputs](https://github.com/arminazimi/evergreen/issues/186)
  - [Document the data channel and trust model](https://github.com/arminazimi/evergreen/issues/187)
  - [Add the `checkDependency` core API](https://github.com/arminazimi/evergreen/issues/188)
  - [Add `evergreen check <purl>`](https://github.com/arminazimi/evergreen/issues/189)
  - [Add the `check_dependency` MCP tool](https://github.com/arminazimi/evergreen/issues/190)
  - [Claude Code hook: check dependencies an agent adds](https://github.com/arminazimi/evergreen/issues/191)
  - [Codex integration: check dependencies an agent adds](https://github.com/arminazimi/evergreen/issues/192)
  - [Evaluate guardrail triggering across agents](https://github.com/arminazimi/evergreen/issues/197)
  - [Add `evergreen init --agents`](https://github.com/arminazimi/evergreen/issues/203)
  - [Publish `llms.txt` and generated `llms-full.txt`](https://github.com/arminazimi/evergreen/issues/206)
  - [Improve npm and README discoverability metadata](https://github.com/arminazimi/evergreen/issues/207)
  - [Generate an EOL event calendar from the registry](https://github.com/arminazimi/evergreen/issues/287)
  - [Go: add positive, negative, zero-finding, and malformed fixtures](https://github.com/arminazimi/evergreen/issues/319)
  - [Go: parse go.mod with exact line locations](https://github.com/arminazimi/evergreen/issues/320)
  - [Go: parse go.work with exact line locations](https://github.com/arminazimi/evergreen/issues/321)
  - [Go: create the registry file and the first 5 curated rules](https://github.com/arminazimi/evergreen/issues/322)
  - [Go: import lifecycle signals from Go release support policy](https://github.com/arminazimi/evergreen/issues/323)
  - [Go: import lifecycle signals from `// Deprecated:` comments on direct modules](https://github.com/arminazimi/evergreen/issues/324)

## Phase 21.5 — Release 0.2: ship what is built

_2026-10-17 → 2026-10-31 · 21 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/18)_

**When this phase is complete, Evergreen has:**

- Evergreen 0.2.0 on npm with trusted publishing, provenance, and a post-publish smoke test
- The first signed data bundle and the first scheduled importer run
- Agent host setups verified in live hosts; Evergreen listed in the official MCP Registry
- Bounded monorepo discovery, proven on monorepos in the public corpus
- Go detection wired and documented; a full corpus run on the current rules

**Epics**

- **[Cross-platform CI and safe release automation](https://github.com/arminazimi/evergreen/issues/70)** — Run on every supported platform and release without long-lived credentials. _(9 tasks)_
- **[Deepen JavaScript, Python, and GitHub Actions coverage](https://github.com/arminazimi/evergreen/issues/71)** — Grow the four shipped ecosystems from 15 rules to hundreds before expanding further. _(12 tasks)_
- **[Signed lifecycle data channel](https://github.com/arminazimi/evergreen/issues/72)** — Ship lifecycle data independently of code releases so freshness no longer depends on upgrading Evergreen. _(10 tasks)_
- **[Agent guardrail: check dependencies as agents add them](https://github.com/arminazimi/evergreen/issues/73)** — Coding agents often choose deprecated packages from training data. Check every dependency an agent adds, at the moment it adds it. _(10 tasks)_
- **[Go lifecycle detection](https://github.com/arminazimi/evergreen/issues/43)** — Detect evidence-backed Go lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(11 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Schedule importers to open data PRs](https://github.com/arminazimi/evergreen/issues/122)
  - [Run the full public corpus after the container and Go additions](https://github.com/arminazimi/evergreen/issues/640)
  - [Add `server.json` for the official MCP Registry](https://github.com/arminazimi/evergreen/issues/204)
  - [Publish Evergreen to the official MCP Registry](https://github.com/arminazimi/evergreen/issues/205)

## Phase 22 — Backend, cloud, and Kubernetes coverage

_2026-12-16 → 2027-01-15 · 85 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/14)_

**When this phase is complete, Evergreen has:**

- Rust, Java and Kotlin, .NET, Kubernetes API, and serverless runtime (AWS Lambda, Azure Functions, Google Cloud) detection
- Polished one-step GitHub Action published in GitHub Marketplace; container image on GHCR; Homebrew tap; README badge
- Expiring, machine-readable suppression reasons
- Detector maturity levels and a generated coverage matrix; 100-repository corpus with regression thresholds
- Public reference page for every lifecycle rule, with JSON-LD and a sitemap
- Integrations: GitHub starter workflow, MegaLinter, reviewdog, and trunk
- Second public launch: Kubernetes and serverless checks for DevOps teams

**Epics**

- **[Shared detector contract, conformance suite, and maturity levels](https://github.com/arminazimi/evergreen/issues/39)** — Apply one quality bar to every built-in and external detector, and expose detector maturity. _(11 tasks)_
- **[One-step GitHub Action and Marketplace](https://github.com/arminazimi/evergreen/issues/37)** — One Evergreen step after checkout with safe defaults, published in GitHub Marketplace. _(6 tasks)_
- **[Expiring, machine-readable suppression reasons](https://github.com/arminazimi/evergreen/issues/40)** — Prevent baselines from becoming permanent invisible debt. _(5 tasks)_
- **[More installation channels](https://github.com/arminazimi/evergreen/issues/76)** — Install Evergreen where people already work: container image, Homebrew, and a README badge. _(3 tasks)_
- **[Canonical lifecycle reference pages](https://github.com/arminazimi/evergreen/issues/60)** — Make Evergreen evidence useful as a public reference before anyone installs the CLI. _(4 tasks)_
- **[Rust lifecycle detection](https://github.com/arminazimi/evergreen/issues/46)** — Detect evidence-backed Rust lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(12 tasks)_
- **[Java and Kotlin (JVM) lifecycle detection](https://github.com/arminazimi/evergreen/issues/49)** — Detect evidence-backed Java and Kotlin (JVM) lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(13 tasks)_
- **[.NET lifecycle detection](https://github.com/arminazimi/evergreen/issues/48)** — Detect evidence-backed .NET lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(13 tasks)_
- **[Kubernetes APIs lifecycle detection](https://github.com/arminazimi/evergreen/issues/52)** — Detect evidence-backed Kubernetes APIs lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(11 tasks)_
- **[Serverless runtimes lifecycle detection](https://github.com/arminazimi/evergreen/issues/86)** — Detect evidence-backed Serverless runtimes lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(11 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Add the npm deprecations Renovate found to the importer candidates](https://github.com/arminazimi/evergreen/issues/639)
  - [Generate an ecosystem coverage matrix](https://github.com/arminazimi/evergreen/issues/144)
  - [Enforce per-detector regression thresholds](https://github.com/arminazimi/evergreen/issues/145)
  - [Emit reviewdog diagnostic format (rdjson)](https://github.com/arminazimi/evergreen/issues/291)
  - [Add "Scanned by Evergreen" attribution to Action summaries and badges](https://github.com/arminazimi/evergreen/issues/294)

## Phase 23 — Standards and precise code analysis

_2027-01-16 → 2027-02-15 · 55 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/15)_

**When this phase is complete, Evergreen has:**

- tree-sitter usage analysis for JavaScript, TypeScript, and Python, replacing regex matching
- Symbol-level API deprecation rules for Node.js and Python
- CLE (ECMA-428) export, CycloneDX lifecycle enrichment, and CycloneDX/SPDX SBOM input
- Agent migration benchmark with published results
- Terraform and Android detection; community-led Dart/Flutter and Swift detection
- Lifecycle rules for Django, Angular, Vue, React Native, Next.js, and Spring Boot
- Third public launch: lifecycle data in SBOMs

**Epics**

- **[Parser-backed usage analysis and symbol-level rules](https://github.com/arminazimi/evergreen/issues/77)** — Replace regex usage analysis with tree-sitter (WASM, offline) and add API-level deprecation rules. _(9 tasks)_
- **[Terraform lifecycle detection](https://github.com/arminazimi/evergreen/issues/56)** — Detect evidence-backed Terraform lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(11 tasks)_
- **[Android lifecycle detection](https://github.com/arminazimi/evergreen/issues/50)** — Detect evidence-backed Android lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(9 tasks)_ _(community-led; may slip without blocking v1)_
- **[Dart and Flutter lifecycle detection](https://github.com/arminazimi/evergreen/issues/53)** — Detect evidence-backed Dart and Flutter lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(11 tasks)_ _(community-led; may slip without blocking v1)_
- **[Swift and Apple toolchains lifecycle detection](https://github.com/arminazimi/evergreen/issues/55)** — Detect evidence-backed Swift and Apple toolchains lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(11 tasks)_ _(community-led; may slip without blocking v1)_

  Also in this phase, from epics listed in other phases:
  - [Django: curated lifecycle rules, fixtures, and migration packets](https://github.com/arminazimi/evergreen/issues/246)
  - [Angular: curated lifecycle rules, fixtures, and migration packets](https://github.com/arminazimi/evergreen/issues/247)
  - [Vue: curated lifecycle rules, fixtures, and migration packets](https://github.com/arminazimi/evergreen/issues/248)
  - [Next.js: curated lifecycle rules, fixtures, and migration packets](https://github.com/arminazimi/evergreen/issues/250)

## Phase 24 — Community ecosystems and open data

_2027-02-16 → 2027-03-15 · 65 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/16)_

**When this phase is complete, Evergreen has:**

- Community-led PHP, Ruby, C/C++, Shell/PowerShell, database, and CI runner-image detection
- Lifecycle rules for Rails and Laravel
- GitLab CI/CD component published in the GitLab CI/CD Catalog
- Open lifecycle dataset with a static JSON API, and maintainer-declared lifecycle read from CLE files
- Public governance, RFC process, detector owners, and Code of Conduct
- VS Code extension with inline diagnostics

**Epics**

- **[PHP lifecycle detection](https://github.com/arminazimi/evergreen/issues/45)** — Detect evidence-backed PHP lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(12 tasks)_ _(community-led; may slip without blocking v1)_
- **[Ruby lifecycle detection](https://github.com/arminazimi/evergreen/issues/54)** — Detect evidence-backed Ruby lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(12 tasks)_ _(community-led; may slip without blocking v1)_
- **[C and C++ lifecycle detection](https://github.com/arminazimi/evergreen/issues/44)** — Detect evidence-backed C and C++ lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(10 tasks)_ _(community-led; may slip without blocking v1)_
- **[Shell and PowerShell lifecycle detection](https://github.com/arminazimi/evergreen/issues/47)** — Detect evidence-backed Shell and PowerShell lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(9 tasks)_ _(community-led; may slip without blocking v1)_
- **[Database runtimes lifecycle detection](https://github.com/arminazimi/evergreen/issues/51)** — Detect evidence-backed Database runtimes lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(10 tasks)_ _(community-led; may slip without blocking v1)_
- **[CI runner images (GitLab, CircleCI, Azure Pipelines) lifecycle detection](https://github.com/arminazimi/evergreen/issues/87)** — Detect evidence-backed CI runner images (GitLab, CircleCI, Azure Pipelines) lifecycle risks at exact locations and produce migration packets, built from small independent tasks. _(10 tasks)_ _(community-led; may slip without blocking v1)_

  Also in this phase, from epics listed in other phases:
  - [Scaffold the VS Code extension](https://github.com/arminazimi/evergreen/issues/271)
  - [Show findings as diagnostics](https://github.com/arminazimi/evergreen/issues/272)

## Phase 25 — Evergreen v1

_2027-03-16 → 2027-04-15 · 3 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/17)_

**When this phase is complete, Evergreen has:**

- Evergreen v1 with published compatibility guarantees and release notes
- Public accuracy and performance dashboard; 300-repository independent corpus
- Tested playbooks for CLI, agents, GitHub, and GitLab
- Threat model, parser fuzzing, SLSA provenance, and a 100k-file monorepo benchmark
- Persian README and quickstart
- Demo video, case studies, and the v1 launch

**Epics**

- **[Reproducible accuracy and performance dashboard](https://github.com/arminazimi/evergreen/issues/61)** — Make quality claims inspectable rather than promotional. _(3 tasks)_

## Phase 26 — Evergreen checks itself

_2026-10-23 → 2026-11-12 · 6 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/19)_

**When this phase is complete, Evergreen has:**

- Evergreen scans its own repository in CI and fails on new findings
- Its own Actions and dependencies are pinned and monitored with Evergreen
- Every self-scan finding is triaged, and the released CLI is smoke-tested on this repository

**Epics**


  Also in this phase, from epics listed in other phases:
  - [Scan this repository with Evergreen in CI and fail on new findings](https://github.com/arminazimi/evergreen/issues/997)
  - [Pin and monitor this repository's own GitHub Actions with Evergreen](https://github.com/arminazimi/evergreen/issues/998)
  - [Run Evergreen as a pre-push hook in this repository](https://github.com/arminazimi/evergreen/issues/999)
  - [Label self-scan findings and publish a monthly self-scan report](https://github.com/arminazimi/evergreen/issues/1000)
  - [Smoke-test the published CLI against this repository after every release](https://github.com/arminazimi/evergreen/issues/1001)
  - [Require agents working in this repository to check dependencies with Evergreen](https://github.com/arminazimi/evergreen/issues/1002)

## Phase 27 — Trust and accuracy

_2026-11-13 → 2026-12-03 · 10 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/20)_

**When this phase is complete, Evergreen has:**

- Detectors promoted from experimental to beta on measured recall and precision
- Independent corpus, differential testing, and a regression gate on every pull request
- Confidence levels, `report-issue`, and per-detector accuracy tables

**Epics**

- **[Independent ground truth and the public benchmark corpus](https://github.com/arminazimi/evergreen/issues/41)** — Make accuracy claims independent of Evergreen's own rule set: ground truth comes from real migration commits, upstream changelogs, CI failures, and differential testing. _(22 tasks)_

## Phase 28 — Data freshness

_2026-12-04 → 2026-12-24 · 5 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/21)_

**When this phase is complete, Evergreen has:**

- Scheduled end-of-life rules for Node.js, Python, Go, and PostgreSQL
- Importers that open reviewed rule PRs, and recorded future end-of-life dates
- Curated framework rules with migration packets

**Epics**

- **[Lifecycle data importers (automated, reviewed rule generation)](https://github.com/arminazimi/evergreen/issues/69)** — Replace hand-written rules with importers that read authoritative machine-readable sources and open reviewable PRs. _(15 tasks)_
- **[Framework lifecycle coverage](https://github.com/arminazimi/evergreen/issues/80)** — Cover the frameworks teams actually upgrade: Django, Angular, Vue, React Native, Next.js, Spring Boot, Rails, Laravel. _(20 tasks)_

## Phase 29 — Agent-native

_2026-12-25 → 2027-01-14 · 10 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/22)_

**When this phase is complete, Evergreen has:**

- One-command setup that configures every agent host
- Compact, stable, machine-readable output with documented error codes
- A repository lifecycle status file agents can read, and one focused Skill per ecosystem

**Epics**

- **[Auto-discoverability for agents and humans](https://github.com/arminazimi/evergreen/issues/75)** — Make Evergreen findable wherever agents and developers look: MCP Registry, llms.txt, agent instruction files, marketplaces. _(14 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Playbook: agent-driven migrations](https://github.com/arminazimi/evergreen/issues/305)

## Phase 30 — Personal use

_2027-01-15 → 2027-02-04 · 11 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/23)_

**When this phase is complete, Evergreen has:**

- Scan many projects at once, and check the tools installed on this machine
- A standalone binary, a friendly first run, a terminal browser, and an HTML report
- A global pre-push hook and a weekly digest for personal projects

**Epics**


  Also in this phase, from epics listed in other phases:
  - [Install a git pre-push hook with `evergreen init --hooks`](https://github.com/arminazimi/evergreen/issues/284)
  - [Playbook: manual CLI checks](https://github.com/arminazimi/evergreen/issues/304)
  - [Scan several paths in one run with a combined summary](https://github.com/arminazimi/evergreen/issues/1014)
  - [Add `evergreen doctor --system` to check tools installed on this machine](https://github.com/arminazimi/evergreen/issues/1015)
  - [Ship a standalone binary that needs no Node.js](https://github.com/arminazimi/evergreen/issues/1016)
  - [Add `evergreen watch` and a weekly digest for personal projects](https://github.com/arminazimi/evergreen/issues/1017)
  - [Make the first run zero-config with a friendly summary](https://github.com/arminazimi/evergreen/issues/1018)
  - [Add an interactive terminal browser for findings](https://github.com/arminazimi/evergreen/issues/1019)
  - [Add `evergreen init --personal` for a global config and pre-push hook](https://github.com/arminazimi/evergreen/issues/1020)
  - [Add shell completions and examples to `--help`](https://github.com/arminazimi/evergreen/issues/1021)
  - [Add a single-file HTML report](https://github.com/arminazimi/evergreen/issues/1022)

## Phase 31 — Forecast and planning

_2027-02-05 → 2027-02-25 · 9 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/24)_

**When this phase is complete, Evergreen has:**

- `evergreen forecast` and `--as-of` show what becomes end of life next
- Upgrade paths, replacement compatibility checks, and a lifecycle risk score
- Transitive dependencies with the path that pulls them in, and an exposure timeline from git history

**Epics**


  Also in this phase, from epics listed in other phases:
  - [Add `evergreen forecast` for what becomes end of life in the next 6 and 12 months](https://github.com/arminazimi/evergreen/issues/1023)
  - [Add `--as-of <date>` to scan as the world will look on a date](https://github.com/arminazimi/evergreen/issues/1024)
  - [Add an upgrade path planner with safe intermediate versions](https://github.com/arminazimi/evergreen/issues/1025)
  - [Add a lifecycle risk score from time since end of life, usage, and advisories](https://github.com/arminazimi/evergreen/issues/1026)
  - [Show how long a finding has been end of life using git history](https://github.com/arminazimi/evergreen/issues/1027)
  - [Check that a suggested replacement supports the repository's runtime](https://github.com/arminazimi/evergreen/issues/1028)
  - [Add `--min-support-days` to flag lines ending soon](https://github.com/arminazimi/evergreen/issues/1029)
  - [Report deprecated transitive dependencies with the path that pulls them in](https://github.com/arminazimi/evergreen/issues/1030)
  - [Track a lifecycle debt score over time](https://github.com/arminazimi/evergreen/issues/1031)

## Phase 32 — Fix and automation

_2027-02-26 → 2027-03-18 · 6 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/25)_

**When this phase is complete, Evergreen has:**

- `evergreen fix --dry-run` prints deterministic patches
- Fixers for Actions versions and runtime pins, and codemod packs for common replacements
- Verify-after-fix, and tested playbooks for CLI, agents, GitHub, and GitLab

**Epics**

- **[Agent, developer, and DevOps playbooks](https://github.com/arminazimi/evergreen/issues/62)** — Give each audience a tested path from discovery to verified migration. _(11 tasks)_

## Phase 33 — Team and DevOps

_2027-03-19 → 2027-04-08 · 20 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/26)_

**When this phase is complete, Evergreen has:**

- GitLab CI/CD component in the Catalog, with Code Quality reports
- Pre-commit, MegaLinter, trunk, and starter-workflow integrations
- Pull-request summaries, `evergreen diff`, owner routing, and scheduled lifecycle-watch workflows

**Epics**

- **[GitLab CI/CD component and Catalog](https://github.com/arminazimi/evergreen/issues/36)** — Give GitLab users the same scan, baseline, gate, and report workflow as GitHub users. _(5 tasks)_
- **[Growth and distribution loops](https://github.com/arminazimi/evergreen/issues/83)** — Put Evergreen inside the pipelines and agent workflows people already run, and grow through predictable launch moments instead of one launch at the end. _(35 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Playbook: GitHub Actions](https://github.com/arminazimi/evergreen/issues/306)
  - [Playbook: GitLab pipelines](https://github.com/arminazimi/evergreen/issues/307)

## Phase 34 — Editor and guard

_2027-04-09 → 2027-04-29 · 5 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/27)_

**When this phase is complete, Evergreen has:**

- VS Code extension on the Marketplace and Open VSX
- A language server that shows lifecycle diagnostics in any editor, and a JetBrains plugin
- `evergreen guard` blocks end-of-life packages before npm, pip, or uv installs them

**Epics**

- **[VS Code extension](https://github.com/arminazimi/evergreen/issues/82)** — Show lifecycle findings inline in the editor using the local CLI. _(7 tasks)_

## Phase 35 — Coverage: cloud, OS, and runtimes

_2027-04-30 → 2027-05-20 · 12 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/28)_

**When this phase is complete, Evergreen has:**

- Scan built container images, `kubectl` dumps, Terraform plan JSON, and rendered Helm output
- Managed Kubernetes and Azure and Google Cloud database engines
- Elixir, Scala, Deno, and Bun detection, and runtime pins in Dockerfile `RUN` lines

**Epics**


  Also in this phase, from epics listed in other phases:
  - [Judge managed Kubernetes versions in Terraform](https://github.com/arminazimi/evergreen/issues/1050)
  - [Judge OS distro base images in Dockerfiles](https://github.com/arminazimi/evergreen/issues/1051)
  - [Judge Helm chart and chart dependency deprecations](https://github.com/arminazimi/evergreen/issues/1052)
  - [Add an Elixir and Mix detector](https://github.com/arminazimi/evergreen/issues/1053)
  - [Add a Scala and sbt detector](https://github.com/arminazimi/evergreen/issues/1054)
  - [Add Deno and Bun runtime detection](https://github.com/arminazimi/evergreen/issues/1055)
  - [Judge Azure and Google Cloud database engine versions](https://github.com/arminazimi/evergreen/issues/1056)
  - [Scan a built container image or root filesystem](https://github.com/arminazimi/evergreen/issues/1057)
  - [Scan a `kubectl get -o yaml` dump](https://github.com/arminazimi/evergreen/issues/1058)
  - [Scan Terraform plan JSON](https://github.com/arminazimi/evergreen/issues/1059)
  - [Scan rendered Helm output](https://github.com/arminazimi/evergreen/issues/1060)
  - [Judge runtime pins in Dockerfile RUN lines and scripts](https://github.com/arminazimi/evergreen/issues/1061)

## Phase 36 — Interop and standards

_2027-05-21 → 2027-06-10 · 11 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/29)_

**When this phase is complete, Evergreen has:**

- CLE (ECMA-428) export and validation, CycloneDX enrichment, and CycloneDX and SPDX input
- Maintainer-declared lifecycle read from dependencies
- Renovate presets and OSV cross-reference for unpatched exposure

**Epics**

- **[Lifecycle standards: CLE (ECMA-428), CycloneDX, SPDX](https://github.com/arminazimi/evergreen/issues/78)** — Become the reference implementation of existing lifecycle standards rather than inventing a new one. _(9 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Read maintainer-declared CLE lifecycle from dependencies](https://github.com/arminazimi/evergreen/issues/261)
  - [Share implementation feedback with Ecma TC54 (CLE)](https://github.com/arminazimi/evergreen/issues/263)

## Phase 37 — Evergreen v1 hardening

_2027-06-11 → 2027-07-01 · 14 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/30)_

**When this phase is complete, Evergreen has:**

- Contract and surface audit, compatibility guarantees, and v1 release notes
- Threat model, parser fuzzing, bounded parser input, and SLSA provenance
- Reproducible builds and an enforced performance budget on a large-monorepo benchmark

**Epics**

- **[Evergreen v1 release readiness and launch](https://github.com/arminazimi/evergreen/issues/57)** — Ship a stable v1 whose contracts, quality evidence, distribution, and maintenance policy are ready for broad adoption. _(6 tasks)_
- **[Security and performance hardening for v1](https://github.com/arminazimi/evergreen/issues/84)** — Prove Evergreen is safe on untrusted repositories and fast on large monorepos. _(13 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Test playbook examples in CI](https://github.com/arminazimi/evergreen/issues/308)

## Phase 38 — Proof

_2027-07-02 → 2027-07-22 · 7 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/31)_

**When this phase is complete, Evergreen has:**

- Agent migration benchmark with published results
- A public "State of EOL" page and an example gallery
- Three real migration case studies

**Epics**

- **[Agent migration benchmark](https://github.com/arminazimi/evergreen/issues/79)** — Prove that Evergreen migration packets help agents complete real migrations. _(4 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Publish three real migration case studies](https://github.com/arminazimi/evergreen/issues/316)
  - [Publish a "State of EOL" page from the benchmark corpus](https://github.com/arminazimi/evergreen/issues/1067)
  - [Create an example gallery with one runnable repository per ecosystem](https://github.com/arminazimi/evergreen/issues/1068)

## Phase 39 — Growth

_2027-07-23 → 2027-08-12 · 20 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/32)_

**When this phase is complete, Evergreen has:**

- Mini-launches, outreach, the launch kit, the demo video, and the v1 launch
- RSS feed, weekly "what just went end of life" posts, and a public lookup page
- Adoption funnel in the monthly report, and translated docs

**Epics**

- **[Launch and adoption](https://github.com/arminazimi/evergreen/issues/85)** — Turn v1 into real usage through a strong demo, case studies, and community outreach. _(14 tasks)_

  Also in this phase, from epics listed in other phases:
  - [Generate a monthly progress report](https://github.com/arminazimi/evergreen/issues/270)
  - [Write the first three "Is your repo affected?" EOL posts](https://github.com/arminazimi/evergreen/issues/288)
  - [Mini-launch 1: the agent dependency guardrail](https://github.com/arminazimi/evergreen/issues/289)
  - [Mini-launch 2: Kubernetes and serverless runtime checks](https://github.com/arminazimi/evergreen/issues/295)
  - [Write three more EOL posts from the calendar](https://github.com/arminazimi/evergreen/issues/296)
  - [Submit Evergreen to relevant awesome lists](https://github.com/arminazimi/evergreen/issues/297)
  - [Mini-launch 3: CLE (ECMA-428) and SBOM lifecycle enrichment](https://github.com/arminazimi/evergreen/issues/298)
  - [Write three more EOL posts from the calendar](https://github.com/arminazimi/evergreen/issues/299)
  - [Add adoption metrics to the monthly progress report](https://github.com/arminazimi/evergreen/issues/300)

## Phase 40 — Open data and contributors

_2027-08-13 → 2027-09-02 · 10 tasks · [milestone](https://github.com/arminazimi/evergreen/milestone/33)_

**When this phase is complete, Evergreen has:**

- Open lifecycle dataset with a static JSON API and a documented license
- Governance, RFC process, detector owners, and Code of Conduct
- Rule candidates become good-first-issues automatically

**Epics**

- **[Open lifecycle dataset and maintainer-declared lifecycle](https://github.com/arminazimi/evergreen/issues/81)** — Publish Evergreen's evidence as an open dataset and let maintainers declare lifecycle in their own repositories. _(15 tasks)_
- **[Governance, ownership, and community](https://github.com/arminazimi/evergreen/issues/58)** — Let Evergreen scale beyond one maintainer without weakening evidence standards. _(7 tasks)_

## Not in this roadmap

- A hosted service, accounts, or dashboards that require uploading source code.
- Telemetry in the core (see the privacy ADR in M6; any opt-in design is post-v1).
- Vulnerability scanning or CVE remediation.
- Lifecycle claims without an authoritative, versioned source.

## Earlier roadmaps

- [Three-month launch roadmap (completed)](roadmap-archive/2026-launch.md)
- [Post-launch notes](NEXT.md)
