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
};

export function phaseDescription(month) {
  const m = MONTHS[month];
  const keys = Object.keys(MONTHS);
  const prev = keys[keys.indexOf(month) - 1];
  const start = prev ? `Starts when ${MONTHS[prev].title.split(" — ")[0]} is complete.` : "First phase of the H1 roadmap.";
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
