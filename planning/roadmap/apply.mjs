// Applies the generated roadmap to GitHub. DRY RUN by default.
//
//   node planning/roadmap/apply.mjs            # print the plan, change nothing
//   node planning/roadmap/apply.mjs --apply    # create/update labels, milestone, issues
//
// Resumable: issue numbers are recorded in out/state.json after each step.
// Requires: gh CLI authenticated with `repo` scope.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "arminazimi/evergreen";
const OLD_MILESTONES = [6, 7, 8, 9, 10]; // Phase 15–19; closed after their issues move.
const DELAY_MS = 1500; // stay under GitHub secondary rate limits for content creation

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const statePath = join(out, "state.json");
const apply = process.argv.includes("--apply");

const { milestone, issues } = JSON.parse(readFileSync(join(out, "issues.json"), "utf8"));
const labels = JSON.parse(readFileSync(join(out, "labels.json"), "utf8"));
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { numbers: {}, edited: [], milestone: null };
for (const i of issues) if (i.existing) state.numbers[i.key] = i.existing;

const scratch = mkdtempSync(join(tmpdir(), "evergreen-roadmap-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

function gh(args, input) {
  if (input !== undefined) {
    const file = join(scratch, "payload.json");
    writeFileSync(file, JSON.stringify(input));
    args = [...args, "--input", file];
  }
  return JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8" }) || "null");
}

function resolve(body) {
  return body.replace(/\{\{ref:([^}]+)\}\}/g, (_, key) => {
    const n = state.numbers[key];
    if (!n) throw new Error(`unresolved reference ${key}`);
    return `#${n}`;
  });
}

const newIssues = issues.filter((i) => !i.existing);
const existing = issues.filter((i) => i.existing);

console.log(`${apply ? "APPLY" : "DRY RUN"} → ${REPO}`);
console.log(`- ensure ${labels.length} labels`);
console.log(`- ensure milestone "${milestone.title}" (due ${milestone.dueOn.slice(0, 10)})`);
console.log(`- create ${newIssues.filter((i) => !state.numbers[i.key]).length} new issues (${newIssues.length} total new)`);
console.log(`- rewrite ${existing.length} existing issues (title, body, labels, milestone)`);
console.log(`- set final bodies with resolved references on all ${issues.length} issues`);
console.log(`- close old milestones ${OLD_MILESTONES.join(", ")} once empty`);
if (!apply) {
  console.log("\nNothing was changed. Re-run with --apply after maintainer approval.");
  process.exit(0);
}

// 1. Labels
const present = new Set(gh([`repos/${REPO}/labels?per_page=100`, "--paginate"]).map((l) => l.name));
for (const l of labels) {
  if (present.has(l.name)) continue;
  gh([`repos/${REPO}/labels`, "-X", "POST"], { name: l.name, color: l.color, description: l.description.slice(0, 100) });
  console.log(`label + ${l.name}`);
}

// 2. Milestone
if (!state.milestone) {
  const found = gh([`repos/${REPO}/milestones?state=all&per_page=100`]).find((m) => m.title === milestone.title);
  state.milestone = found?.number ?? gh([`repos/${REPO}/milestones`, "-X", "POST"], { title: milestone.title, description: milestone.description, due_on: milestone.dueOn }).number;
  save();
  console.log(`milestone #${state.milestone}`);
}

// 3. Create new issues with placeholder bodies (references resolve in step 4).
for (const issue of newIssues) {
  if (state.numbers[issue.key]) continue;
  const created = gh([`repos/${REPO}/issues`, "-X", "POST"], {
    title: issue.title,
    body: `<!-- evergreen-roadmap-key: ${issue.key} -->\n_Roadmap issue is being created; details follow shortly._`,
    labels: issue.labels,
    milestone: state.milestone,
  });
  state.numbers[issue.key] = created.number;
  save();
  console.log(`+ #${created.number} ${issue.title}`);
  await sleep(DELAY_MS);
}

// 4. Final bodies, titles, labels, milestone for every issue.
for (const issue of issues) {
  if (state.edited.includes(issue.key)) continue;
  gh([`repos/${REPO}/issues/${state.numbers[issue.key]}`, "-X", "PATCH"], {
    title: issue.title,
    body: resolve(issue.body),
    labels: issue.labels,
    milestone: state.milestone,
  });
  state.edited.push(issue.key);
  save();
  console.log(`~ #${state.numbers[issue.key]} ${issue.title}`);
  await sleep(DELAY_MS / 2);
}

// 5. Close emptied old milestones.
for (const n of OLD_MILESTONES) {
  const m = gh([`repos/${REPO}/milestones/${n}`]);
  if (m.state === "open" && m.open_issues === 0) {
    gh([`repos/${REPO}/milestones/${n}`, "-X", "PATCH"], { state: "closed" });
    console.log(`closed milestone #${n} ${m.title}`);
  }
}
console.log("Done.");
