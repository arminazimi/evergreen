// Applies the generated roadmap to GitHub. DRY RUN by default.
//
//   node planning/roadmap/apply.mjs            # print the plan, change nothing
//   node planning/roadmap/apply.mjs --apply    # sync labels, phase milestones, and issues
//
// Each phase is its own milestone. Resumable and idempotent: issue and milestone
// numbers are recorded in out/state.json, along with a digest of what was last
// written to each issue so unchanged issues are skipped.
// Requires: gh CLI authenticated with `repo` scope.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RETIRED_LABELS } from "./labels.mjs";
import { CLOSE_WHEN_EMPTY, EXTERNAL } from "./reorg.mjs";

const REPO = "arminazimi/evergreen";
const RETIRED_MILESTONES = [11]; // the single H1 milestone from the first rollout; deleted once empty
const DELAY_MS = 1500; // stay under GitHub secondary rate limits for content creation

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const statePath = join(out, "state.json");
const apply = process.argv.includes("--apply");

const { phases, issues } = JSON.parse(readFileSync(join(out, "issues.json"), "utf8"));
const labels = JSON.parse(readFileSync(join(out, "labels.json"), "utf8"));
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
state.numbers ??= {};
state.phases ??= {};
state.written ??= {};
delete state.milestone;
delete state.edited;
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
  const text = execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 1e8 });
  return text.trim() ? JSON.parse(text) : null;
}

function resolve(body) {
  return body.replace(/\{\{ref:([^}]+)\}\}/g, (_, key) => {
    const n = state.numbers[key];
    if (!n) throw new Error(`unresolved reference ${key}`);
    return `#${n}`;
  });
}

const newIssues = issues.filter((i) => !i.existing && !state.numbers[i.key]);
const payload = (issue) => ({
  title: issue.title,
  body: resolve(issue.body),
  labels: issue.labels,
  milestone: state.phases[issue.month],
});
const digest = (p) => createHash("sha256").update(JSON.stringify(p)).digest("hex").slice(0, 16);

console.log(`${apply ? "APPLY" : "DRY RUN"} → ${REPO}`);
console.log(`- ensure ${labels.length} labels; delete retired labels: ${RETIRED_LABELS.join(", ")}`);
for (const p of phases) console.log(`- ensure milestone "${p.title}" (due ${p.dueOn.slice(0, 10)}, ${issues.filter((i) => i.month === p.month).length} issues)`);
console.log(`- create ${newIssues.length} new issues`);
console.log(`- sync title, body, labels, and phase milestone on ${issues.length} issues (unchanged ones are skipped)`);
console.log(`- move ${Object.keys(EXTERNAL).length} issues created outside the roadmap data to their new phase`);
console.log(`- close phases ${CLOSE_WHEN_EMPTY.join(", ")} once they have no open issues`);
console.log(`- delete retired milestones ${RETIRED_MILESTONES.join(", ")} once empty`);
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

// 2. Phase milestones, in order.
const existingMilestones = gh([`repos/${REPO}/milestones?state=all&per_page=100`]);
for (const p of phases) {
  const found = existingMilestones.find((m) => m.title === p.title);
  const body = { title: p.title, description: p.description, due_on: p.dueOn };
  if (found) {
    gh([`repos/${REPO}/milestones/${found.number}`, "-X", "PATCH"], body);
    state.phases[p.month] = found.number;
  } else {
    state.phases[p.month] = gh([`repos/${REPO}/milestones`, "-X", "POST"], body).number;
    console.log(`milestone + #${state.phases[p.month]} ${p.title}`);
  }
  save();
}

// 3. Create new issues with placeholder bodies (references resolve in step 4).
for (const issue of newIssues) {
  const created = gh([`repos/${REPO}/issues`, "-X", "POST"], {
    title: issue.title,
    body: `<!-- evergreen-roadmap-key: ${issue.key} -->\n_Roadmap issue is being created; details follow shortly._`,
    labels: issue.labels,
    milestone: state.phases[issue.month],
  });
  state.numbers[issue.key] = created.number;
  save();
  console.log(`+ #${created.number} ${issue.title}`);
  await sleep(DELAY_MS);
}

// 4. Sync every issue; skip ones whose last written payload is unchanged.
for (const issue of issues) {
  const p = payload(issue);
  const d = digest(p);
  if (state.written[issue.key] === d) continue;
  gh([`repos/${REPO}/issues/${state.numbers[issue.key]}`, "-X", "PATCH"], p);
  state.written[issue.key] = d;
  save();
  console.log(`~ #${state.numbers[issue.key]} → ${issue.phase.split(" — ")[0]} · ${issue.title}`);
  await sleep(DELAY_MS / 2);
}

// 4b. Issues created outside the roadmap data only change milestone.
for (const [number, month] of Object.entries(EXTERNAL)) {
  const key = `external:${number}`;
  const body = { milestone: state.phases[month] };
  const d = digest(body);
  if (state.written[key] === d) continue;
  gh([`repos/${REPO}/issues/${number}`, "-X", "PATCH"], body);
  state.written[key] = d;
  save();
  console.log(`~ #${number} → ${month}`);
  await sleep(DELAY_MS / 2);
}

// 5. Delete retired labels (removes them from every issue) and empty retired milestones.
for (const name of RETIRED_LABELS) {
  if (!present.has(name)) continue;
  gh([`repos/${REPO}/labels/${encodeURIComponent(name)}`, "-X", "DELETE"]);
  console.log(`label - ${name}`);
}
for (const n of RETIRED_MILESTONES) {
  if (!existingMilestones.some((m) => m.number === n)) continue;
  const left = gh([`repos/${REPO}/issues?milestone=${n}&state=all&per_page=1`]);
  if (left.length === 0) {
    gh([`repos/${REPO}/milestones/${n}`, "-X", "DELETE"]);
    console.log(`milestone - #${n}`);
  } else {
    console.log(`milestone #${n} still has issues; not deleted`);
  }
}
// 6. Close phases whose open issues all moved on; closed issues keep their history.
for (const month of CLOSE_WHEN_EMPTY) {
  const n = state.phases[month];
  if (!n) continue;
  const open = gh([`repos/${REPO}/issues?milestone=${n}&state=open&per_page=1`]);
  if (open.length === 0) {
    gh([`repos/${REPO}/milestones/${n}`, "-X", "PATCH"], { state: "closed" });
    console.log(`milestone closed #${n} (${month})`);
  } else {
    console.log(`milestone #${n} (${month}) still has open issues; left open`);
  }
}
console.log("Done.");
