// Builds the "Evergreen Roadmap" GitHub Project (v2) from the roadmap data.
// DRY RUN by default; `--apply` creates or updates the project.
//
//   node planning/roadmap/project.mjs --apply
//
// Adds every roadmap issue and sets Lane, Size, Phase, Start date, and Target date
// so the Board, Table, and Roadmap layouts work. Views themselves cannot be created
// through the API; see docs printed at the end.
// Requires: gh CLI with `project` scope.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MONTHS } from "./labels.mjs";

const OWNER = "arminazimi";
const REPO = "evergreen";
const TITLE = "Evergreen Roadmap";
const BATCH = 20;

const here = dirname(fileURLToPath(import.meta.url));
const statePath = join(here, "out", "project-state.json");
const apply = process.argv.includes("--apply");
const { issues } = JSON.parse(readFileSync(join(here, "out", "issues.json"), "utf8"));
const numbers = JSON.parse(readFileSync(join(here, "out", "state.json"), "utf8")).numbers;
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const scratch = mkdtempSync(join(tmpdir(), "evergreen-project-"));
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

// Retries transient 5xx and secondary-rate-limit failures; every call here is idempotent.
function graphql(query, variables = {}) {
  const file = join(scratch, "q.json");
  writeFileSync(file, JSON.stringify({ query, variables }));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = JSON.parse(execFileSync("gh", ["api", "graphql", "--input", file], { encoding: "utf8", maxBuffer: 1e8, stdio: ["ignore", "pipe", "pipe"] }));
      if (res.errors) throw new Error(JSON.stringify(res.errors));
      return res.data;
    } catch (error) {
      const text = `${error.stderr ?? ""}${error.message}`;
      if (attempt >= 6 || !/HTTP 5\d\d|secondary rate|was submitted too quickly|timeout|unexpected end of JSON/i.test(text)) throw error;
      const wait = 2000 * 2 ** attempt;
      console.log(`retry ${attempt} in ${wait / 1000}s (${text.match(/HTTP \d+|secondary rate|too quickly|timeout/i)?.[0]})`);
      execFileSync("sleep", [String(wait / 1000)]);
    }
  }
}

const LANE = { strong: "Strong agent", free: "Free agent / contributor", maintainer: "Maintainer" };
const PHASES = Object.entries(MONTHS).map(([month, m]) => ({ month, name: m.title, start: m.window.split(" → ")[0], end: m.window.split(" → ")[1] }));

console.log(`${apply ? "APPLY" : "DRY RUN"} → project "${TITLE}" for ${OWNER}/${REPO}`);
console.log(`- fields: Lane, Size, Phase, Start date, Target date; Status gains "In review"`);
console.log(`- add ${issues.length} issues and set their fields`);
if (!apply) process.exit(0);

// 1. Project
const owner = graphql(`query($login:String!){ user(login:$login){ id projectsV2(first:50){ nodes{ id number title } } } }`, { login: OWNER }).user;
let project = owner.projectsV2.nodes.find((p) => p.title === TITLE);
if (!project) {
  project = graphql(`mutation($owner:ID!,$title:String!){ createProjectV2(input:{ownerId:$owner,title:$title}){ projectV2{ id number title } } }`, { owner: owner.id, title: TITLE }).createProjectV2.projectV2;
  console.log(`project + #${project.number}`);
}
const repoId = graphql(`query{ repository(owner:"${OWNER}",name:"${REPO}"){ id } }`).repository.id;
graphql(`mutation($p:ID!,$r:ID!){ linkProjectV2ToRepository(input:{projectId:$p,repositoryId:$r}){ clientMutationId } }`, { p: project.id, r: repoId });
graphql(`mutation($p:ID!,$d:String!,$r:String!){ updateProjectV2(input:{projectId:$p,shortDescription:$d,readme:$r,public:true}){ projectV2{ id } } }`, {
  p: project.id,
  d: "Six-phase roadmap to Evergreen v1: coverage, proof, agent-native, and standards.",
  r: "Generated from `planning/roadmap/` in arminazimi/evergreen. Phases are milestones and run in order. Pick any Todo task whose dependencies are closed; `Lane` says who it suits.",
});
state.project = { id: project.id, number: project.number };
save();

// 2. Fields
const fieldsQuery = `query($p:ID!){ node(id:$p){ ... on ProjectV2 { fields(first:50){ nodes{
  ... on ProjectV2FieldCommon { id name dataType }
  ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }`;
const getFields = () => graphql(fieldsQuery, { p: project.id }).node.fields.nodes;
let fields = getFields();
const ensureSelect = (name, options) => {
  if (fields.find((f) => f.name === name)) return;
  graphql(`mutation($p:ID!,$n:String!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){ createProjectV2Field(input:{projectId:$p,dataType:SINGLE_SELECT,name:$n,singleSelectOptions:$o}){ clientMutationId } }`,
    { p: project.id, n: name, o: options.map((o) => ({ name: o, color: "GRAY", description: "" })) });
  console.log(`field + ${name}`);
};
const ensureDate = (name) => {
  if (fields.find((f) => f.name === name)) return;
  graphql(`mutation($p:ID!,$n:String!){ createProjectV2Field(input:{projectId:$p,dataType:DATE,name:$n}){ clientMutationId } }`, { p: project.id, n: name });
  console.log(`field + ${name}`);
};
ensureSelect("Lane", Object.values(LANE));
ensureSelect("Size", ["XS", "S", "M"]);
ensureSelect("Phase", PHASES.map((p) => p.name));
ensureDate("Start date");
ensureDate("Target date");
fields = getFields();

// Phase options: add any phase that is missing, keeping the existing ones.
const phaseField = fields.find((f) => f.name === "Phase");
const missingPhases = PHASES.filter((p) => !phaseField.options.some((o) => o.name === p.name));
if (missingPhases.length) {
  const mutation = `mutation($f:ID!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){ updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:$o}){ clientMutationId } }`;
  const keep = phaseField.options.map((o) => ({ name: o.name, color: "GRAY", description: "" }));
  const added = missingPhases.map((p) => ({ name: p.name, color: "GRAY", description: "" }));
  graphql(mutation, { f: phaseField.id, o: [...keep, ...added] });
  console.log(`field ~ Phase (+${missingPhases.length} options)`);
  fields = getFields();
  // Options are recreated, so every item's Phase must be set again.
  state.projectPhaseSet = [];
}

// Status: Todo, In progress, In review, Done
const status = fields.find((f) => f.name === "Status");
if (status && !status.options.find((o) => o.name === "In review")) {
  const wanted = ["Todo", "In progress", "In review", "Done"];
  const colors = { Todo: "GRAY", "In progress": "YELLOW", "In review": "PURPLE", Done: "GREEN" };
  try {
    graphql(`mutation($f:ID!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){ updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:$o}){ clientMutationId } }`,
      { f: status.id, o: wanted.map((n) => ({ name: n, color: colors[n], description: "" })) });
    console.log("field ~ Status (Todo, In progress, In review, Done)");
  } catch (e) {
    console.log(`Status options not updated through the API (${e.message.slice(0, 80)}); add "In review" in the UI.`);
  }
  fields = getFields();
}
const field = (n) => fields.find((f) => f.name === n);
const option = (n, o) => field(n).options.find((x) => x.name === o).id;

// 3. Items
const nodeIds = new Map();
let cursor = null;
do {
  const page = graphql(`query($c:String){ repository(owner:"${OWNER}",name:"${REPO}"){ issues(first:100,after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id number } } } }`, { c: cursor }).repository.issues;
  for (const n of page.nodes) nodeIds.set(n.number, n.id);
  cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (cursor);

state.projectItems ??= {};
const pending = issues.filter((i) => !state.projectItems[i.key]);
for (let i = 0; i < pending.length; i += BATCH) {
  const chunk = pending.slice(i, i + BATCH);
  const m = chunk.map((it, j) => `a${j}: addProjectV2ItemById(input:{projectId:"${project.id}",contentId:"${nodeIds.get(numbers[it.key])}"}){ item{ id } }`).join("\n");
  const res = graphql(`mutation{ ${m} }`);
  chunk.forEach((it, j) => (state.projectItems[it.key] = res[`a${j}`].item.id));
  save();
  console.log(`items ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
}

// 3b. Repair: items created during a 5xx can exist by id but never appear in the
// project. Delete and re-add any issue the project listing does not show.
const listed = new Set();
cursor = null;
do {
  const page = graphql(`query($c:String){ node(id:"${project.id}"){ ... on ProjectV2 { items(first:100,after:$c){ pageInfo{ hasNextPage endCursor } nodes{ content{ ... on Issue{ number } } } } } } }`, { c: cursor }).node.items;
  for (const n of page.nodes) if (n.content?.number) listed.add(n.content.number);
  cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (cursor);
state.projectFieldsSet ??= [];
const ghosts = issues.filter((i) => !listed.has(numbers[i.key]));
for (const it of ghosts) {
  graphql(`mutation{ deleteProjectV2Item(input:{projectId:"${project.id}",itemId:"${state.projectItems[it.key]}"}){ deletedItemId } }`);
  const res = graphql(`mutation{ addProjectV2ItemById(input:{projectId:"${project.id}",contentId:"${nodeIds.get(numbers[it.key])}"}){ item{ id } } }`);
  state.projectItems[it.key] = res.addProjectV2ItemById.item.id;
  state.projectFieldsSet = state.projectFieldsSet.filter((k) => k !== it.key);
  save();
}
if (ghosts.length) console.log(`repaired ${ghosts.length} items missing from the project listing`);

// 4. Field values (batched aliases)
state.projectFieldsSet ??= [];
state.projectPhaseSet ??= [...state.projectFieldsSet];
const todo = issues.filter((i) => !state.projectFieldsSet.includes(i.key) || !state.projectPhaseSet.includes(i.key));
const setSelect = (item, f, o) => `updateProjectV2ItemFieldValue(input:{projectId:"${project.id}",itemId:"${item}",fieldId:"${field(f).id}",value:{singleSelectOptionId:"${o}"}}){ clientMutationId }`;
const setDate = (item, f, d) => `updateProjectV2ItemFieldValue(input:{projectId:"${project.id}",itemId:"${item}",fieldId:"${field(f).id}",value:{date:"${d}"}}){ clientMutationId }`;
for (let i = 0; i < todo.length; i += 3) {
  const chunk = todo.slice(i, i + 3);
  const ops = [];
  chunk.forEach((it) => {
    const item = state.projectItems[it.key];
    const phase = PHASES.find((p) => p.month === it.month);
    ops.push(setSelect(item, "Phase", option("Phase", phase.name)));
    ops.push(setDate(item, "Start date", phase.start));
    ops.push(setDate(item, "Target date", phase.end));
    if (state.projectFieldsSet.includes(it.key)) return; // Status, Lane, and Size are already set
    ops.push(setSelect(item, "Status", option("Status", "Todo")));
    if (it.lane) ops.push(setSelect(item, "Lane", option("Lane", LANE[it.lane])));
    if (it.size) ops.push(setSelect(item, "Size", option("Size", it.size)));
  });
  graphql(`mutation{ ${ops.map((o, k) => `o${k}: ${o}`).join("\n")} }`);
  for (const c of chunk) {
    if (!state.projectFieldsSet.includes(c.key)) state.projectFieldsSet.push(c.key);
    if (!state.projectPhaseSet.includes(c.key)) state.projectPhaseSet.push(c.key);
  }
  save();
  if ((i / 3) % 10 === 0) console.log(`fields ${Math.min(i + 3, todo.length)}/${todo.length}`);
}

console.log(`Done: https://github.com/users/${OWNER}/projects/${project.number}`);
