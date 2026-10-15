// Builds the roadmap issue set, validates it, and writes a local preview.
// Usage: node planning/roadmap/build.mjs
// Output: planning/roadmap/out/{issues.json,labels.json,preview.md}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ECOSYSTEMS, ecosystemEpic, ecosystemTasks } from "./ecosystems.mjs";
import { EXISTING_LABELS, LABELS, LANES, MILESTONE, MONTHS, SIZES, ecosystemLabel } from "./labels.mjs";
import { EPICS, TASKS } from "./workstreams.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");

// Open issues on GitHub at planning time; every one must be mapped.
const OPEN_ISSUES = [15, 16, 17, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62];

const epics = [...EPICS, ...ECOSYSTEMS.map(ecosystemEpic)];
const tasks = [...TASKS, ...ECOSYSTEMS.flatMap(ecosystemTasks)];
const all = [...epics, ...tasks];

// ── Validation
const errors = [];
const byKey = new Map();
for (const item of all) {
  if (byKey.has(item.key)) errors.push(`duplicate key ${item.key}`);
  byKey.set(item.key, item);
}
for (const task of tasks) {
  if (!byKey.has(task.epic) || byKey.get(task.epic).kind !== "epic") errors.push(`${task.key}: unknown epic ${task.epic}`);
  for (const dep of task.deps ?? []) if (!byKey.has(dep)) errors.push(`${task.key}: unknown dependency ${dep}`);
  if (!LANES[task.lane]) errors.push(`${task.key}: unknown lane ${task.lane}`);
  if (!SIZES[task.size]) errors.push(`${task.key}: size must be XS, S, or M`);
  if (!MONTHS[task.month]) errors.push(`${task.key}: unknown month ${task.month}`);
}
const mapped = all.filter((i) => i.key.startsWith("#")).map((i) => Number(i.key.slice(1)));
for (const n of OPEN_ISSUES) if (!mapped.includes(n)) errors.push(`open issue #${n} is not mapped`);
for (const n of mapped) if (!OPEN_ISSUES.includes(n)) errors.push(`#${n} is mapped but not an open issue`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

// ── Labels
function labelsFor(item) {
  const set = new Set(["roadmap", MONTHS[item.month].label, ...(item.areas ?? [])]);
  if (item.eco) set.add(ecosystemLabel(item.eco).name);
  if (item.kind === "epic") {
    set.add("type: epic");
  } else {
    set.add(LANES[item.lane].label);
    set.add(SIZES[item.size].label);
    for (const type of item.types ?? []) set.add(type);
    if (item.goodFirst) set.add("good first issue");
    if (item.helpWanted || item.goodFirst) set.add("help wanted");
    if (item.blocked) set.add("status: blocked");
  }
  return [...set];
}

const ecoIds = new Set(all.map((i) => i.eco).filter(Boolean));
const labelDefs = [...LABELS, ...[...ecoIds].sort().map(ecosystemLabel)];
const known = new Set([...EXISTING_LABELS, ...labelDefs.map((l) => l.name)]);
for (const item of all) for (const l of labelsFor(item)) if (!known.has(l)) errors.push(`${item.key}: undefined label ${l}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

// ── Bodies. `{{ref:key}}` is resolved to an issue number by apply.mjs.
const ref = (key) => `{{ref:${key}}}`;
const marker = (key) => `<!-- evergreen-roadmap-key: ${key} -->`;
const monthLine = (m) => `${m} · ${MONTHS[m].theme} (${MONTHS[m].window})`;

function taskBody(task) {
  const lines = [
    marker(task.key),
    `> **Epic:** ${ref(task.epic)} · **Month:** ${monthLine(task.month)}`,
    `> **Lane:** \`${LANES[task.lane].label}\` — ${LANES[task.lane].who} · **Size:** ${task.size} (${SIZES[task.size].meaning})`,
    "",
  ];
  if (task.blocked) lines.push(`> [!WARNING]\n> **Blocked:** ${task.blocked}`, "");
  lines.push("## Goal", task.goal, "");
  lines.push("## Agent brief", "", "**Files**", ...task.files.map((f) => `- \`${f}\``), "");
  lines.push("**Steps**", ...task.steps.map((s, i) => `${i + 1}. ${s}`), "");
  const dont = task.dont ?? [
    "Do not expand scope beyond this issue; open a follow-up instead.",
    "Do not add network access to scans.",
  ];
  lines.push("**Do not**", ...dont.map((d) => `- ${d}`), "");
  if (task.lane !== "maintainer") lines.push("**Run**", "```bash", "npm ci", "npm run check", "```", "");
  lines.push("## Done when", ...task.done.map((d) => `- [ ] ${d}`), "");
  if (task.deps?.length) lines.push("## Depends on", ...task.deps.map((d) => `- ${ref(d)}`), "");
  lines.push(
    "---",
    "<sub>Part of the Evergreen H1 roadmap. New here? Read `CONTRIBUTING.md` and `AGENTS.md`, then comment to claim this issue. One issue = one pull request.</sub>",
  );
  return lines.join("\n");
}

function epicBody(epic, children) {
  const lines = [
    marker(epic.key),
    `> **Epic** · **Month:** ${monthLine(epic.month)}${epic.tier ? ` · **Tier:** ${epic.tier}${epic.tier === 2 ? " (community-led; may slip without blocking v1)" : ""}` : ""}`,
    "",
    "## Outcome",
    epic.goal,
    "",
  ];
  if (epic.scope?.length) lines.push("## Scope", ...epic.scope.map((s) => `- ${s}`), "");
  if (epic.nonGoals?.length) lines.push("## Non-goals", ...epic.nonGoals.map((s) => `- ${s}`), "");
  lines.push("## Tasks", ...children.map((c) => `- [ ] ${ref(c.key)}`), "");
  if (epic.exit?.length) lines.push("## Exit criteria", ...epic.exit.map((s) => `- [ ] ${s}`), "");
  lines.push("---", "<sub>Pick any open task above whose dependencies are closed. Lane labels say who it suits.</sub>");
  return lines.join("\n");
}

const issues = all.map((item) => {
  const children = tasks.filter((t) => t.epic === item.key);
  return {
    key: item.key,
    existing: item.key.startsWith("#") ? Number(item.key.slice(1)) : null,
    kind: item.kind ?? "task",
    title: item.title,
    month: item.month,
    lane: item.lane ?? null,
    size: item.size ?? null,
    epic: item.epic ?? null,
    deps: item.deps ?? [],
    labels: labelsFor(item),
    body: item.kind === "epic" ? epicBody(item, children) : taskBody(item),
  };
});

// ── Output
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "issues.json"), JSON.stringify({ milestone: MILESTONE, issues }, null, 2) + "\n");
writeFileSync(join(outDir, "labels.json"), JSON.stringify(labelDefs, null, 2) + "\n");

const count = (pred) => issues.filter(pred).length;
const months = Object.keys(MONTHS);
const lanes = Object.keys(LANES);
const stats = [
  "| Month | Epics | Tasks | strong | free | maintainer | good first issue |",
  "|---|---|---|---|---|---|---|",
  ...months.map((m) => `| ${m} | ${count((i) => i.month === m && i.kind === "epic")} | ${count((i) => i.month === m && i.kind === "task")} | ${lanes.map((l) => count((i) => i.month === m && i.lane === l)).join(" | ")} | ${count((i) => i.month === m && i.labels.includes("good first issue"))} |`),
  `| **All** | **${count((i) => i.kind === "epic")}** | **${count((i) => i.kind === "task")}** | ${lanes.map((l) => `**${count((i) => i.lane === l)}**`).join(" | ")} | **${count((i) => i.labels.includes("good first issue"))}** |`,
];

const title = (key) => byKey.get(key)?.title ?? key;
const preview = [
  `# ${MILESTONE.title} — issue preview`,
  "",
  `Generated locally by \`planning/roadmap/build.mjs\`. Nothing has been sent to GitHub.`,
  "",
  `- Issues: **${issues.length}** (${count((i) => i.existing)} existing rewritten, ${count((i) => !i.existing)} new)`,
  `- Labels to ensure: **${labelDefs.length}**`,
  `- Milestone due: ${MILESTONE.dueOn.slice(0, 10)}`,
  "",
  ...stats,
  "",
  ...months.flatMap((m) => [
    `## ${m} · ${MONTHS[m].theme} (${MONTHS[m].window})`,
    "",
    ...epics.filter((e) => e.month === m).flatMap((e) => {
      const children = tasks.filter((t) => t.epic === e.key);
      return [
        `### ${e.key.startsWith("#") ? `${e.key} ` : ""}${e.title} (${children.length} tasks)`,
        "",
        "| Key | Task | Month | Lane | Size | Labels |",
        "|---|---|---|---|---|---|",
        ...children.map((c) => `| \`${c.key}\` | ${c.title} | ${c.month} | ${c.lane} | ${c.size} | ${issues.find((i) => i.key === c.key).labels.filter((l) => l === "good first issue" || l.startsWith("eco:") || l.startsWith("status:")).join(", ")} |`),
        "",
      ];
    }),
  ]),
  "## Sample bodies",
  "",
  ...["E-guardrail", "guard.cli", "go.parse-1", "#43"].flatMap((k) => [`### ${title(k)}`, "", "```markdown", issues.find((i) => i.key === k).body, "```", ""]),
].join("\n");
writeFileSync(join(outDir, "preview.md"), preview + "\n");

console.log(`OK: ${issues.length} issues (${count((i) => i.kind === "epic")} epics, ${count((i) => i.kind === "task")} tasks), ${labelDefs.length} labels`);
console.log(stats.join("\n"));
