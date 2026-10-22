// Phases, label taxonomy, and targets for the H1 roadmap. Existing labels are listed so the apply
// script can verify them; only missing labels are created.

// The roadmap program. Each phase below is its own GitHub milestone, run in order.
export const MILESTONE = {
  title: "Evergreen H1 — Coverage & Proof",
  dueOn: "2027-04-15T12:00:00Z",
};

// Keys M1–M6 are internal; GitHub shows the phase milestone titles.
export const MONTHS = {
  M1: {
    phase: 20, title: "Phase 20 — Ready for contributors and real data", dueOn: "2026-11-15T12:00:00Z",
    window: "2026-10-15 → 2026-11-15", theme: "Ready for contributors and real data",
    delivers: [
      "AGENTS.md, issue forms, PR template, CODEOWNERS, dev container, and a 30-minute first-contribution path",
      "Lifecycle rule format v2 keyed by PURL and VERS, with provenance and freshness; all bundled registries migrated",
      "SHA-pinned GitHub Actions classified instead of silently ignored",
      "Importer framework plus importers for Node.js, Python, npm, PyPI, GitHub Actions runtimes, and runner images",
      "Independent ground truth from real migration commits; 10 new GitHub Actions corpus repositories; weekly corpus runs",
      "Shared detector conformance suite run by every built-in detector",
      "CI on Linux, Windows, and macOS with Node 22 and 24; npm trusted publishing with provenance",
      "40+ new curated npm, Python, and GitHub Actions rules; weekly adoption measurement",
    ],
  },
  M2: {
    phase: 21, title: "Phase 21 — Fresh data and agent guardrails", dueOn: "2026-12-15T12:00:00Z",
    window: "2026-11-16 → 2026-12-15", theme: "Fresh data and agent guardrails",
    delivers: [
      "Signed lifecycle data bundle with `evergreen data update` and `evergreen data status`; scans stay offline",
      "Agent guardrail: `evergreen check`, the `check_dependency` MCP tool, and hooks for Claude Code and Codex, with setups for Cursor, Gemini CLI, Copilot, and Kilo Code",
      "MCP resources, prompts, and typed outputs; listing in the official MCP Registry; llms.txt",
      "`evergreen init --agents --hooks` with a git pre-push hook and a pre-commit hook",
      "SARIF output and GitHub Code Scanning upload",
      "Detector scaffolding generator; Go and container base-image detection",
      "Scheduled importers opening data PRs; differential testing against Renovate and xeol; 50-repository corpus",
      "First public launch: the agent dependency guardrail",
    ],
  },
  R1: {
    phase: 21.5, title: "Phase 21.5 — Release 0.2: ship what is built", dueOn: "2026-10-31T12:00:00Z",
    window: "2026-10-17 → 2026-10-31", theme: "Release 0.2: ship what is built",
    delivers: [
      "Evergreen 0.2.0 on npm with trusted publishing, provenance, and a post-publish smoke test",
      "The first signed data bundle and the first scheduled importer run",
      "Agent host setups verified in live hosts; Evergreen listed in the official MCP Registry",
      "Bounded monorepo discovery, proven on monorepos in the public corpus",
      "Go detection wired and documented; a full corpus run on the current rules",
    ],
  },
  M3: {
    phase: 22, title: "Phase 22 — Backend, cloud, and Kubernetes coverage", dueOn: "2027-01-15T12:00:00Z",
    window: "2026-12-16 → 2027-01-15", theme: "Backend, cloud, and Kubernetes coverage",
    delivers: [
      "Rust, Java and Kotlin, .NET, Kubernetes API, and serverless runtime (AWS Lambda, Azure Functions, Google Cloud) detection",
      "Polished one-step GitHub Action published in GitHub Marketplace; container image on GHCR; Homebrew tap; README badge",
      "Expiring, machine-readable suppression reasons",
      "Detector maturity levels and a generated coverage matrix; 100-repository corpus with regression thresholds",
      "Public reference page for every lifecycle rule, with JSON-LD and a sitemap",
      "Integrations: GitHub starter workflow, MegaLinter, reviewdog, and trunk",
      "Second public launch: Kubernetes and serverless checks for DevOps teams",
    ],
  },
  M4: {
    phase: 23, title: "Phase 23 — Standards and precise code analysis", dueOn: "2027-02-15T12:00:00Z",
    window: "2027-01-16 → 2027-02-15", theme: "Standards and precise code analysis",
    delivers: [
      "tree-sitter usage analysis for JavaScript, TypeScript, and Python, replacing regex matching",
      "Symbol-level API deprecation rules for Node.js and Python",
      "CLE (ECMA-428) export, CycloneDX lifecycle enrichment, and CycloneDX/SPDX SBOM input",
      "Agent migration benchmark with published results",
      "Terraform and Android detection; community-led Dart/Flutter and Swift detection",
      "Lifecycle rules for Django, Angular, Vue, React Native, Next.js, and Spring Boot",
      "Third public launch: lifecycle data in SBOMs",
    ],
  },
  M5: {
    phase: 24, title: "Phase 24 — Community ecosystems and open data", dueOn: "2027-03-15T12:00:00Z",
    window: "2027-02-16 → 2027-03-15", theme: "Community ecosystems and open data",
    delivers: [
      "Community-led PHP, Ruby, C/C++, Shell/PowerShell, database, and CI runner-image detection",
      "Lifecycle rules for Rails and Laravel",
      "GitLab CI/CD component published in the GitLab CI/CD Catalog",
      "Open lifecycle dataset with a static JSON API, and maintainer-declared lifecycle read from CLE files",
      "Public governance, RFC process, detector owners, and Code of Conduct",
      "VS Code extension with inline diagnostics",
    ],
  },
  M6: {
    phase: 25, title: "Phase 25 — Evergreen v1", dueOn: "2027-04-15T12:00:00Z",
    window: "2027-03-16 → 2027-04-15", theme: "Evergreen v1",
    delivers: [
      "Evergreen v1 with published compatibility guarantees and release notes",
      "Public accuracy and performance dashboard; 300-repository independent corpus",
      "Tested playbooks for CLI, agents, GitHub, and GitLab",
      "Threat model, parser fuzzing, SLSA provenance, and a 100k-file monorepo benchmark",
      "Persian README and quickstart",
      "Demo video, case studies, and the v1 launch",
    ],
  },
  // Phases 26–40 reorganize the open work by outcome. Order matters; the dates only
  // space the phases out. Phases 22–25 keep their closed history and are closed.
  P26: {
    phase: 26, title: "Phase 26 — Evergreen checks itself", dueOn: "2026-11-12T12:00:00Z", first: true,
    window: "2026-10-23 → 2026-11-12", theme: "Evergreen checks itself",
    delivers: [
      "Evergreen scans its own repository in CI and fails on new findings",
      "Its own Actions and dependencies are pinned and monitored with Evergreen",
      "Every self-scan finding is triaged, and the released CLI is smoke-tested on this repository",
    ],
  },
  P27: {
    phase: 27, title: "Phase 27 — Trust and accuracy", dueOn: "2026-12-03T12:00:00Z",
    window: "2026-11-13 → 2026-12-03", theme: "Trust and accuracy",
    delivers: [
      "Detectors promoted from experimental to beta on measured recall and precision",
      "Independent corpus, differential testing, and a regression gate on every pull request",
      "Confidence levels, `report-issue`, and per-detector accuracy tables",
    ],
  },
  P28: {
    phase: 28, title: "Phase 28 — Data freshness", dueOn: "2026-12-24T12:00:00Z",
    window: "2026-12-04 → 2026-12-24", theme: "Data freshness",
    delivers: [
      "Scheduled end-of-life rules for Node.js, Python, Go, and PostgreSQL",
      "Importers that open reviewed rule PRs, and recorded future end-of-life dates",
      "Curated framework rules with migration packets",
    ],
  },
  P29: {
    phase: 29, title: "Phase 29 — Agent-native", dueOn: "2027-01-14T12:00:00Z",
    window: "2026-12-25 → 2027-01-14", theme: "Agent-native",
    delivers: [
      "One-command setup that configures every agent host",
      "Compact, stable, machine-readable output with documented error codes",
      "A repository lifecycle status file agents can read, and one focused Skill per ecosystem",
    ],
  },
  P30: {
    phase: 30, title: "Phase 30 — Personal use", dueOn: "2027-02-04T12:00:00Z",
    window: "2027-01-15 → 2027-02-04", theme: "Personal use",
    delivers: [
      "Scan many projects at once, and check the tools installed on this machine",
      "A standalone binary, a friendly first run, a terminal browser, and an HTML report",
      "A global pre-push hook and a weekly digest for personal projects",
    ],
  },
  P31: {
    phase: 31, title: "Phase 31 — Forecast and planning", dueOn: "2027-02-25T12:00:00Z",
    window: "2027-02-05 → 2027-02-25", theme: "Forecast and planning",
    delivers: [
      "`evergreen forecast` and `--as-of` show what becomes end of life next",
      "Upgrade paths, replacement compatibility checks, and a lifecycle risk score",
      "Transitive dependencies with the path that pulls them in, and an exposure timeline from git history",
    ],
  },
  P32: {
    phase: 32, title: "Phase 32 — Fix and automation", dueOn: "2027-03-18T12:00:00Z",
    window: "2027-02-26 → 2027-03-18", theme: "Fix and automation",
    delivers: [
      "`evergreen fix --dry-run` prints deterministic patches",
      "Fixers for Actions versions and runtime pins, and codemod packs for common replacements",
      "Verify-after-fix, and tested playbooks for CLI, agents, GitHub, and GitLab",
    ],
  },
  P33: {
    phase: 33, title: "Phase 33 — Team and DevOps", dueOn: "2027-04-08T12:00:00Z",
    window: "2027-03-19 → 2027-04-08", theme: "Team and DevOps",
    delivers: [
      "GitLab CI/CD component in the Catalog, with Code Quality reports",
      "Pre-commit, MegaLinter, trunk, and starter-workflow integrations",
      "Pull-request summaries, `evergreen diff`, owner routing, and scheduled lifecycle-watch workflows",
    ],
  },
  P34: {
    phase: 34, title: "Phase 34 — Editor and guard", dueOn: "2027-04-29T12:00:00Z",
    window: "2027-04-09 → 2027-04-29", theme: "Editor and guard",
    delivers: [
      "VS Code extension on the Marketplace and Open VSX",
      "A language server that shows lifecycle diagnostics in any editor, and a JetBrains plugin",
      "`evergreen guard` blocks end-of-life packages before npm, pip, or uv installs them",
    ],
  },
  P35: {
    phase: 35, title: "Phase 35 — Coverage: cloud, OS, and runtimes", dueOn: "2027-05-20T12:00:00Z",
    window: "2027-04-30 → 2027-05-20", theme: "Coverage: cloud, OS, and runtimes",
    delivers: [
      "Scan built container images, `kubectl` dumps, Terraform plan JSON, and rendered Helm output",
      "Managed Kubernetes and Azure and Google Cloud database engines",
      "Elixir, Scala, Deno, and Bun detection, and runtime pins in Dockerfile `RUN` lines",
    ],
  },
  P36: {
    phase: 36, title: "Phase 36 — Interop and standards", dueOn: "2027-06-10T12:00:00Z",
    window: "2027-05-21 → 2027-06-10", theme: "Interop and standards",
    delivers: [
      "CLE (ECMA-428) export and validation, CycloneDX enrichment, and CycloneDX and SPDX input",
      "Maintainer-declared lifecycle read from dependencies",
      "Renovate presets and OSV cross-reference for unpatched exposure",
    ],
  },
  P37: {
    phase: 37, title: "Phase 37 — Evergreen v1 hardening", dueOn: "2027-07-01T12:00:00Z",
    window: "2027-06-11 → 2027-07-01", theme: "Evergreen v1 hardening",
    delivers: [
      "Contract and surface audit, compatibility guarantees, and v1 release notes",
      "Threat model, parser fuzzing, bounded parser input, and SLSA provenance",
      "Reproducible builds and an enforced performance budget on a large-monorepo benchmark",
    ],
  },
  P38: {
    phase: 38, title: "Phase 38 — Proof", dueOn: "2027-07-22T12:00:00Z",
    window: "2027-07-02 → 2027-07-22", theme: "Proof",
    delivers: [
      "Agent migration benchmark with published results",
      "A public \"State of EOL\" page and an example gallery",
      "Three real migration case studies",
    ],
  },
  P39: {
    phase: 39, title: "Phase 39 — Growth", dueOn: "2027-08-12T12:00:00Z",
    window: "2027-07-23 → 2027-08-12", theme: "Growth",
    delivers: [
      "Mini-launches, outreach, the launch kit, the demo video, and the v1 launch",
      "RSS feed, weekly \"what just went end of life\" posts, and a public lookup page",
      "Adoption funnel in the monthly report, and translated docs",
    ],
  },
  P40: {
    phase: 40, title: "Phase 40 — Open data and contributors", dueOn: "2027-09-02T12:00:00Z",
    window: "2027-08-13 → 2027-09-02", theme: "Open data and contributors",
    delivers: [
      "Open lifecycle dataset with a static JSON API and a documented license",
      "Governance, RFC process, detector owners, and Code of Conduct",
      "Rule candidates become good-first-issues automatically",
    ],
  },
};

export function phaseDescription(month) {
  const m = MONTHS[month];
  const keys = Object.keys(MONTHS);
  const prev = keys[keys.indexOf(month) - 1];
  const start = m.first
    ? "First phase of the reorganized roadmap; earlier phases are closed."
    : prev ? `Starts when ${MONTHS[prev].title.split(" — ")[0]} is complete.` : "First phase of the H1 roadmap.";
  return [
    `${m.window}. ${start}`,
    "",
    "When this phase is complete, Evergreen has:",
    ...m.delivers.map((d) => `- ${d}`),
    "",
    "Exit: every issue in this milestone is closed and `npm run check` is green on main.",
  ].join("\n");
}

export const TARGETS = [
  ["Ecosystems and platforms detected", "4", "25+ (12 stable, the rest experimental)"],
  ["Lifecycle signals imported with evidence", "0", "3,000+"],
  ["Curated rules with migration packets", "15", "300+"],
  ["Symbol-level API deprecation rules", "0", "100+"],
  ["Independent ground-truth corpus", "20 repositories, self-defined", "300 repositories, ground truth not authored by Evergreen"],
  ["Precision per stable detector", "1.0 against own rules", "≥ 0.95 against independent ground truth"],
  ["Data freshness", "tied to package releases", "≤ 7 days through a signed data channel"],
  ["Distribution", "npm, skills.sh", "+ MCP Registry, GitHub Marketplace, GitLab Catalog, Docker, Homebrew, pre-commit, MegaLinter, VS Code, Claude, Codex"],
  ["External contributors with merged PRs", "0", "15+"],
];

export const LANES = {
  strong: { label: "lane: strong-agent", who: "Codex or Claude (or an experienced contributor)" },
  free: { label: "lane: free-agent", who: "Freebuff, Kilo Code, or any contributor" },
  maintainer: { label: "lane: maintainer", who: "Maintainer only (accounts, submissions, releases, outreach)" },
};

export const SIZES = {
  XS: { label: "size: XS", meaning: "under 1 hour" },
  S: { label: "size: S", meaning: "a few hours" },
  M: { label: "size: M", meaning: "about a day" },
};

const blue = "1D76DB";
const purple = "5319E7";
const green = "0E8A16";
const teal = "006B75";
const gray = "BFDADC";
const orange = "D93F0B";
const yellow = "FBCA04";

export const LABELS = [
  // Lanes
  { name: LANES.strong.label, color: purple, description: "Needs a strong coding agent or experienced contributor" },
  { name: LANES.free.label, color: green, description: "Spec-complete: suitable for free agents and new contributors" },
  { name: LANES.maintainer.label, color: orange, description: "Requires maintainer accounts, credentials, or decisions" },
  // Sizes
  ...Object.values(SIZES).map((s) => ({ name: s.label, color: gray, description: `Expected effort: ${s.meaning}` })),
  // Types
  { name: "type: epic", color: "3E4B9E", description: "Tracking issue that groups small tasks" },
  { name: "type: task", color: "C2E0C6", description: "One small, independently mergeable change" },
  { name: "type: rule", color: "C2E0C6", description: "Add or update evidence-backed lifecycle rules" },
  { name: "type: importer", color: "C2E0C6", description: "Import lifecycle signals from an authoritative source" },
  { name: "type: parser", color: "C2E0C6", description: "Parse a manifest, lockfile, or configuration format" },
  { name: "type: fixture", color: "C2E0C6", description: "Test fixtures and corpus entries" },
  { name: "type: docs", color: "C2E0C6", description: "Documentation" },
  { name: "type: test", color: "C2E0C6", description: "Tests, CI, and quality gates" },
  // Status
  { name: "status: blocked", color: "B60205", description: "Blocked on an external dependency" },
  // New areas (existing: core, detector, integration, release, brand, agent, devops, docs)
  { name: "area: data", color: teal, description: "Lifecycle data engine, importers, registry, and data channel" },
  { name: "area: standards", color: teal, description: "CLE (ECMA-428), PURL, VERS, CycloneDX, SARIF" },
  { name: "area: validation", color: teal, description: "Independent ground truth, corpus, and accuracy evidence" },
  { name: "area: community", color: teal, description: "Contributors, governance, and outreach" },
];

// Month labels from the first rollout; phases are milestones now, so these are deleted.
export const RETIRED_LABELS = ["roadmap: M1", "roadmap: M2", "roadmap: M3", "roadmap: M4", "roadmap: M5", "roadmap: M6"];

export const EXISTING_LABELS = [
  "roadmap", "good first issue", "help wanted", "enhancement", "bug", "documentation",
  "area: core", "area: detector", "area: integration", "area: release", "area: brand",
  "area: agent", "area: devops", "area: docs",
];

export function ecosystemLabel(id) {
  return { name: `eco: ${id}`, color: yellow, description: `Ecosystem: ${id}` };
}

export { blue };
