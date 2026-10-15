// Builds the visual roadmap page from the same data as the issues.
// Usage: node planning/roadmap/timeline.mjs  →  planning/roadmap/out/timeline.html

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ECOSYSTEMS, ecosystemEpic, ecosystemTasks } from "./ecosystems.mjs";
import { MILESTONE, MONTHS, TARGETS } from "./labels.mjs";
import { EPICS, TASKS } from "./workstreams.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const statePath = join(here, "out", "state.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { numbers: {}, phases: {} };

const GROUPS = [
  ["evidence", "Evidence and data", ["#38", "E-importers", "E-data-channel", "#41", "E-open-data"]],
  ["detectors", "Detectors and coverage", ["E-existing-eco", "E-sha-pinning", "#39", "#42", "E-tree-sitter", "E-frameworks", ...ECOSYSTEMS.map((e) => e.epic)]],
  ["agents", "Agent-native", ["E-guardrail", "E-mcp-depth", "E-discovery", "E-agent-bench"]],
  ["devops", "DevOps and distribution", ["E-ci-release", "#35", "#37", "#40", "E-distribution", "#36", "E-vscode"]],
  ["standards", "Standards", ["E-standards"]],
  ["growth", "Community and growth", ["E-agents-ready", "E-growth", "#58", "E-launch"]],
  ["v1", "v1 readiness", ["#60", "#61", "#62", "E-hardening", "#57"]],
];

const epics = [...EPICS, ...ECOSYSTEMS.map(ecosystemEpic)];
const tasks = [...TASKS, ...ECOSYSTEMS.flatMap(ecosystemTasks)];
const num = (key) => (key.startsWith("#") ? Number(key.slice(1)) : state.numbers[key] ?? null);

const grouped = new Set(GROUPS.flatMap((g) => g[2]));
const missing = epics.filter((e) => !grouped.has(e.key)).map((e) => e.key);
if (missing.length) throw new Error(`epics without a timeline group: ${missing.join(", ")}`);

const data = {
  milestone: MILESTONE.title,
  months: Object.entries(MONTHS).map(([id, m]) => ({ id, phase: m.phase, theme: m.theme, window: m.window, milestone: state.phases?.[id] ?? null, delivers: m.delivers })),
  targets: TARGETS,
  groups: GROUPS.map(([id, name, keys]) => ({
    id, name,
    epics: keys.map((key) => {
      const e = epics.find((x) => x.key === key);
      return {
        key, n: num(key), title: e.title.replace(/^Epic: /, ""), goal: e.goal, tier: e.tier ?? null,
        tasks: tasks.filter((t) => t.epic === key).map((t) => ({
          n: num(t.key), title: t.title, m: t.month, lane: t.lane, size: t.size,
          gfi: Boolean(t.goodFirst), blocked: Boolean(t.blocked),
        })),
      };
    }),
  })),
  launches: [
    { m: "M2", label: "Agent guardrail" },
    { m: "M3", label: "Kubernetes + serverless" },
    { m: "M4", label: "CLE + SBOM" },
    { m: "M6", label: "v1" },
  ],
};

const template = readFileSync(join(here, "timeline.template.html"), "utf8");
const html = template.replace("/*__DATA__*/null", JSON.stringify(data));
writeFileSync(join(here, "out", "timeline.html"), html);
console.log(`out/timeline.html written (${(html.length / 1024).toFixed(0)} KB)`);
