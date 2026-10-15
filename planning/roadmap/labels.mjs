// Label taxonomy for the H1 roadmap. Existing labels are listed so the apply
// script can verify them; only missing labels are created.

export const MILESTONE = {
  title: "Evergreen H1 — Coverage & Proof",
  dueOn: "2027-04-15T00:00:00Z",
  description:
    "Six-month roadmap (2026-10-15 → 2027-04-15): automated evidence-backed lifecycle data, independent proof, 25+ ecosystems, fully agent-native and auto-discoverable, aligned with ECMA-428 (CLE), PURL, and VERS, and a stable v1. Months are tracked with `roadmap: M1`…`M6` labels.",
};

export const MONTHS = {
  M1: { label: "roadmap: M1", window: "2026-10-15 → 2026-11-15", theme: "Foundation for parallel work and truth" },
  M2: { label: "roadmap: M2", window: "2026-11-16 → 2026-12-15", theme: "Data channel, agent guardrail, first new ecosystems" },
  M3: { label: "roadmap: M3", window: "2026-12-16 → 2027-01-15", theme: "Backend and infrastructure wave, distribution" },
  M4: { label: "roadmap: M4", window: "2027-01-16 → 2027-02-15", theme: "Standards, accuracy, infrastructure and mobile" },
  M5: { label: "roadmap: M5", window: "2027-02-16 → 2027-03-15", theme: "Long tail, open data, community scale" },
  M6: { label: "roadmap: M6", window: "2027-03-16 → 2027-04-15", theme: "v1 and launch" },
};

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
  // Months
  ...Object.values(MONTHS).map((m) => ({ name: m.label, color: "C5DEF5", description: `${m.theme} (${m.window})` })),
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

export const EXISTING_LABELS = [
  "roadmap", "good first issue", "help wanted", "enhancement", "bug", "documentation",
  "area: core", "area: detector", "area: integration", "area: release", "area: brand",
  "area: agent", "area: devops", "area: docs",
];

export function ecosystemLabel(id) {
  return { name: `eco: ${id}`, color: yellow, description: `Ecosystem: ${id}` };
}

export { blue };
