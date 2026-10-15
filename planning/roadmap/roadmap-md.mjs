// Generates the public docs/ROADMAP.md from the same data as the issues.
// Usage: node planning/roadmap/roadmap-md.mjs
// Issue links are added for every key that has a GitHub number (existing issues,
// or keys recorded in out/state.json after apply.mjs runs).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ECOSYSTEMS, ecosystemEpic, ecosystemTasks } from "./ecosystems.mjs";
import { LANES, MILESTONE, MONTHS, TARGETS } from "./labels.mjs";
import { EPICS, TASKS } from "./workstreams.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const REPO_URL = "https://github.com/arminazimi/evergreen";
const statePath = join(here, "out", "state.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { numbers: {}, milestone: null };

const epics = [...EPICS, ...ECOSYSTEMS.map(ecosystemEpic)];
const tasks = [...TASKS, ...ECOSYSTEMS.flatMap(ecosystemTasks)];

function number(key) {
  if (key.startsWith("#")) return Number(key.slice(1));
  return state.numbers[key] ?? null;
}
function link(key, text) {
  const n = number(key);
  return n ? `[${text}](${REPO_URL}/issues/${n})` : text;
}
const cleanTitle = (t) => t.replace(/^Epic: /, "");

const lines = [
  "# Roadmap",
  "",
  `**${MILESTONE.title}** · 2026-10-15 → 2027-04-15${state.milestone ? ` · [milestone](${REPO_URL}/milestone/${state.milestone})` : ""}`,
  "",
  "> This file is generated from `planning/roadmap/` by `node planning/roadmap/roadmap-md.mjs`. Edit the data, not this file.",
  "> Scope changes still require an explicit decision recorded in `docs/decisions/`.",
  "",
  "## Direction",
  "",
  "Evergreen's engineering is ahead of its data and its evidence. For the next six months the order is:",
  "",
  "1. **Content before new surfaces.** Lifecycle rules are generated from authoritative machine-readable sources and reviewed, not hand-written one by one.",
  "2. **Independent proof.** Accuracy is measured against ground truth Evergreen did not write: real migration commits, upstream changelogs, and differential testing.",
  "3. **Agent-native by default.** Agents check dependencies as they add them, and every push can run Evergreen through hooks.",
  "4. **Standards, not a new format.** Rules are keyed by PURL and VERS and exported as CLE (ECMA-428) and CycloneDX lifecycle data.",
  "5. **Grow inside existing workflows.** Evergreen ships into pipelines people already run and launches every month, not once.",
  "",
  "The long-term goal is for Evergreen to be the first lifecycle reference agents and DevOps teams reach for. This roadmap builds the foundation: open evidence, standard formats, and presence in every common pipeline.",
  "",
  "## v1 targets (2027-04-15)",
  "",
  "| Measure | Today | Target |",
  "|---|---|---|",
  ...TARGETS.map((r) => `| ${r.join(" | ")} |`),
  "",
  "## How work is organized",
  "",
  "Every roadmap issue is in one milestone and is small enough for one pull request. Labels say when and by whom:",
  "",
  "| Label | Meaning |",
  "|---|---|",
  ...Object.values(MONTHS).map((m) => `| \`${m.label}\` | ${m.theme} (${m.window}) |`),
  ...Object.values(LANES).map((l) => `| \`${l.label}\` | ${l.who} |`),
  "| `size: XS` / `S` / `M` | Under an hour / a few hours / about a day |",
  "| `good first issue` | A complete brief, isolated change, and fixtures — a good first contribution |",
  "| `type: epic` | Tracking issue that lists its tasks |",
  "",
  "Pick any open task whose dependencies are closed. Each task includes an agent brief with files, steps, commands, and a done-check. See [CONTRIBUTING.md](../CONTRIBUTING.md).",
  "",
];

for (const [month, meta] of Object.entries(MONTHS)) {
  const monthEpics = epics.filter((e) => e.month === month);
  const monthTasks = tasks.filter((t) => t.month === month);
  lines.push(`## ${month} · ${meta.theme}`, "", `_${meta.window} · ${monthTasks.length} tasks_`, "");
  for (const e of monthEpics) {
    const children = tasks.filter((t) => t.epic === e.key);
    const tier = e.tier === 2 ? " _(community-led; may slip without blocking v1)_" : "";
    lines.push(`- **${link(e.key, cleanTitle(e.title))}** — ${e.goal} _(${children.length} tasks)_${tier}`);
  }
  const carried = monthTasks.filter((t) => byEpicMonth(t) !== month);
  if (carried.length) {
    lines.push("", "  Also this month, from epics listed in other months:");
    for (const t of carried) lines.push(`  - ${link(t.key, t.title)}`);
  }
  lines.push("");
}

function byEpicMonth(task) {
  return epics.find((e) => e.key === task.epic)?.month;
}

lines.push(
  "## Not in this roadmap",
  "",
  "- A hosted service, accounts, or dashboards that require uploading source code.",
  "- Telemetry in the core (see the privacy ADR in M6; any opt-in design is post-v1).",
  "- Vulnerability scanning or CVE remediation.",
  "- Lifecycle claims without an authoritative, versioned source.",
  "",
  "## Earlier roadmaps",
  "",
  "- [Three-month launch roadmap (completed)](roadmap-archive/2026-launch.md)",
  "- [Post-launch notes](NEXT.md)",
  "",
);

writeFileSync(join(root, "docs", "ROADMAP.md"), lines.join("\n"));
console.log(`docs/ROADMAP.md written (${lines.length} lines)`);
