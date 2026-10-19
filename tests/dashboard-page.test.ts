import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

interface TextNode {
  kind: "text";
  text: string;
}

interface ElementNode {
  kind: "element";
  tag: string;
  attributes: Map<string, string>;
  children: Node[];
}

type Node = TextNode | ElementNode;

interface Detector {
  id: string;
  level: string;
  earnedLevel: string;
  precisionFloor: { value: number; enforced: boolean };
  run: { truePositives: number; falsePositives: number; falseNegatives: number; precision: number | null; recall: number | null } | null;
  evidence: { repositoriesWithFindings?: number; expectedFindings?: number; zeroFindingRepositories?: number };
}

interface Cell {
  key: string;
  text: string;
  note?: string;
  noteHref?: string | null;
  flag?: string;
}

interface DashboardApi {
  SCHEMA: string;
  BLOB_URL: string;
  NOT_MEASURED: string;
  ABOVE_EVIDENCE_NOTE: string;
  COLUMNS: string[];
  sourceUrl(path: unknown): string | null;
  definitionAnchor(key: unknown): string | null;
  formatRatio(value: unknown): string;
  formatCount(value: unknown): string;
  isAboveEvidence(level: unknown, earned: unknown): boolean;
  runAgeDays(run: unknown): number | null;
  isStale(run: unknown): boolean;
  visitorAgeDays(run: unknown, now: unknown): number | null;
  runStatus(data: unknown, now: unknown): {
    stale: boolean;
    ageDays: number | null;
    runDate: string | null;
    referenceDay: string | null;
    visitorAgeDays: number | null;
    staleAfterDays: number;
  };
  STALE_AFTER_DAYS: number;
  validateData(data: unknown): string | null;
  runFacts(run: unknown): Array<{ label: string; value: string }>;
  rowModel(detector: unknown, sources: unknown): { id: string; cells: Cell[] };
  buildTable(doc: unknown, data: unknown): ElementNode;
  buildMinimums(doc: unknown, data: unknown): ElementNode;
  buildRun(doc: unknown, data: unknown, now?: Date): ElementNode;
  buildDefinitions(doc: unknown, data: unknown): ElementNode;
  buildLimitations(doc: unknown, data: unknown): ElementNode[];
  start(doc: unknown, fetchImpl?: (url: string) => Promise<unknown>): Promise<unknown>;
}

interface Data {
  schemaVersion: string;
  referenceDay: string;
  run: Record<string, unknown> | null;
  detectors: Detector[];
  definitions: Record<string, { label: string; meaning: string; computation: string; source: string }>;
  limitations: string[];
  sources: Record<string, string>;
  evidenceMinimums: Record<string, Record<string, number>>;
}

const script = await readFile(resolve("docs/dashboard/dashboard.js"), "utf8");
const html = await readFile(resolve("docs/dashboard/index.html"), "utf8");
const css = await readFile(resolve("docs/dashboard/style.css"), "utf8");
const data = JSON.parse(await readFile(resolve("docs/dashboard/data.json"), "utf8")) as Data;

const api = (() => {
  const context: { EvergreenDashboard?: DashboardApi } = {};
  runInNewContext(script, context);
  return context.EvergreenDashboard!;
})();

class FakePageNode {
  readonly kind = "element" as const;
  readonly attributes = new Map<string, string>();
  readonly children: Node[] = [];
  constructor(readonly tag: string) {}
  get firstChild(): Node | null {
    return this.children[0] ?? null;
  }
  appendChild(child: Node) {
    this.children.push(child);
  }
  removeChild(child: Node) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

function fakePage(ids: string[]) {
  const byId = new Map<string, FakePageNode>();
  for (const id of ids) byId.set(id, new FakePageNode("div"));
  const doc = {
    getElementById: (id: string) => byId.get(id) ?? null,
    createElement: (tag: string) => new FakePageNode(tag),
    createTextNode: (value: string): TextNode => ({ kind: "text", text: value }),
  };
  return { doc, byId };
}

const response = (body: unknown, status = 200) => Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(body) });

/** The two DOM methods the page uses, with nodes that record what was written. */
function fakeDocument() {
  return {
    createElement(tag: string) {
      const node: ElementNode = { kind: "element", tag, attributes: new Map(), children: [] };
      return Object.assign(node, {
        appendChild(child: Node) {
          node.children.push(child);
        },
        setAttribute(name: string, value: string) {
          node.attributes.set(name, value);
        },
      });
    },
    createTextNode: (value: string): TextNode => ({ kind: "text", text: value }),
  };
}

const text = (node: Node): string =>
  node.kind === "text" ? node.text : node.children.map(text).join("");

function walk(node: ElementNode): ElementNode[] {
  return [node, ...node.children.flatMap((child) => (child.kind === "element" ? walk(child) : []))];
}

function find(node: ElementNode, predicate: (element: ElementNode) => boolean): ElementNode | undefined {
  return walk(node).find(predicate);
}

const normalize = (value: string): string => value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("a missing number reads not measured, never 0, 1, or NaN", () => {
  for (const value of [null, undefined, Number.NaN, Infinity, "1", {}, []]) {
    assert.equal(api.formatRatio(value), "not measured", String(value));
    assert.equal(api.formatCount(value), "not measured", String(value));
  }
  assert.equal(api.formatRatio(0), "0.0000");
  assert.equal(api.formatRatio(1), "1.0000");
  assert.equal(api.formatRatio(0.33333), "0.3333");
  assert.equal(api.formatCount(0), "0");
  assert.equal(api.formatCount(336), "336");
  assert.equal(api.formatCount(-1), "not measured");
  assert.equal(api.formatCount(1.5), "not measured");
});

test("a detector with no run data renders not measured, not zeros", () => {
  const detector: Detector = {
    id: "example",
    level: "experimental",
    earnedLevel: "experimental",
    precisionFloor: { value: 0.95, enforced: false },
    run: null,
    evidence: {},
  };
  const row = api.rowModel(detector, {});
  assert.equal(row.id, "example");
  const cells = Object.fromEntries(row.cells.map((cell) => [cell.key, cell.text]));
  assert.deepEqual(row.cells.map((cell) => cell.key), api.COLUMNS);
  assert.equal(cells.level, "experimental");
  assert.equal(cells.earnedLevel, "experimental");
  for (const key of ["precision", "recall", "truePositives", "falsePositives", "falseNegatives", "repositoriesWithFindings", "expectedFindings", "zeroFindingRepositories"]) {
    assert.equal(cells[key], "not measured", key);
  }
  assert.equal(api.runFacts(null).length, 0);
  assert.match(text(api.buildRun(fakeDocument(), { run: null })), /No full run is recorded/);
});

test("a level above the counted evidence is marked, not hidden", () => {
  assert.equal(api.isAboveEvidence("beta", "experimental"), true);
  assert.equal(api.isAboveEvidence("stable", "experimental"), true);
  assert.equal(api.isAboveEvidence("stable", "beta"), true);
  assert.equal(api.isAboveEvidence("beta", "beta"), false);
  assert.equal(api.isAboveEvidence("experimental", "experimental"), false);
  assert.equal(api.isAboveEvidence("stable", "stable"), false);
  assert.equal(api.isAboveEvidence("unknown", "experimental"), false);
  assert.equal(api.isAboveEvidence(undefined, "experimental"), false);
  const flagged = data.detectors.filter((detector) => api.rowModel(detector, data.sources).cells.find((cell) => cell.key === "level")!.flag);
  assert.deepEqual(flagged.map((detector) => detector.id), ["github-actions", "nodejs", "npm", "python"]);
  const npm = api.rowModel(data.detectors.find((detector) => detector.id === "npm")!, data.sources);
  const level = npm.cells.find((cell) => cell.key === "level")!;
  assert.equal(level.text, "stable");
  assert.equal(level.note, api.ABOVE_EVIDENCE_NOTE);
  assert.equal(level.noteHref, api.BLOB_URL + "docs/decisions/0013-detector-maturity.md");
  for (const detector of data.detectors.filter((entry) => entry.level === entry.earnedLevel)) {
    assert.equal(api.rowModel(detector, data.sources).cells.find((cell) => cell.key === "level")!.flag, undefined);
  }
});

test("links are built only for plain repository paths and known definition anchors", () => {
  assert.equal(api.sourceUrl("benchmarks/thresholds.json"), "https://github.com/arminazimi/evergreen/blob/main/benchmarks/thresholds.json");
  assert.equal(api.sourceUrl("docs/decisions/0013-detector-maturity.md"), api.BLOB_URL + "docs/decisions/0013-detector-maturity.md");
  for (const unsafe of ["javascript:alert(1)", "https://evil.example/x", "//evil.example/x", "../../etc/passwd", "/etc/passwd", "a//b", "a/./b", "", null, 42]) {
    assert.equal(api.sourceUrl(unsafe), null, String(unsafe));
  }
  assert.equal(api.definitionAnchor("precision"), "def-precision");
  for (const unsafe of ["def-x", "a b", "../x", "", "1st", null]) assert.equal(api.definitionAnchor(unsafe), null, String(unsafe));

  const doc = fakeDocument();
  const table = api.buildTable(doc, data);
  const headers = walk(table).filter((node) => node.tag === "th" && node.attributes.get("scope") === "col");
  assert.equal(headers.length, api.COLUMNS.length + 1);
  for (const header of headers.slice(1)) {
    const links = walk(header).filter((node) => node.tag === "a");
    assert.equal(links.length, 2, text(header));
    assert.match(links[0]!.attributes.get("href")!, /^#def-[A-Za-z][A-Za-z0-9]*$/);
    assert.ok(links[1]!.attributes.get("href")!.startsWith(api.BLOB_URL));
  }

  const hostile = {
    definitions: { precision: { label: "Precision", meaning: "m", computation: "c", source: "javascript:alert(1)" } },
  };
  const definitions = api.buildDefinitions(doc, hostile);
  const sourceParagraph = find(definitions, (node) => node.tag === "p" && text(node).startsWith("Source:"))!;
  assert.equal(walk(sourceParagraph).filter((node) => node.tag === "a").length, 0);
});

test("data is written as text nodes, never as markup", () => {
  const hostileId = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const page = {
    ...data,
    detectors: [{ ...data.detectors[0]!, id: hostileId }],
    definitions: { precision: { label: "<b>bold</b>", meaning: "<script>x</script>", computation: "<svg onload=1>", source: "benchmarks/thresholds.json" } },
    limitations: ["<img src=x onerror=alert(3)>"],
  };
  const doc = fakeDocument();
  const nodes = [api.buildTable(doc, page), api.buildDefinitions(doc, page), ...api.buildLimitations(doc, page)];
  for (const node of nodes) {
    for (const element of walk(node)) {
      assert.ok(!["img", "script", "svg", "b"].includes(element.tag), `rendered a ${element.tag} element from data`);
      for (const name of element.attributes.keys()) assert.ok(!name.startsWith("on"), name);
      for (const value of element.attributes.values()) assert.ok(!value.includes("alert("), value);
    }
    assert.ok(text(node).includes(hostileId) || text(node).includes("<img src=x onerror=alert(3)>") || text(node).includes("<script>x</script>"));
  }
  assert.ok(text(api.buildTable(doc, page)).includes(hostileId), "the hostile id is kept as text");
  assert.ok(text(api.buildLimitations(doc, page)[0]!).includes("<img src=x onerror=alert(3)>"));
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
});

test("the data contract is checked before anything renders", () => {
  assert.equal(api.validateData(data), null);
  assert.match(api.validateData({})!, /schemaVersion/);
  assert.match(api.validateData({ schemaVersion: api.SCHEMA })!, /detectors/);
  assert.match(api.validateData({ schemaVersion: api.SCHEMA, detectors: [], definitions: {}, limitations: "x" })!, /limitations/);
  assert.match(api.validateData(null)!, /not an object/);
});

test("the page renders a semantic table with a caption and scope attributes", () => {
  const doc = fakeDocument();
  const table = api.buildTable(doc, { ...data, definitions: data.definitions });
  assert.equal(table.tag, "table");
  assert.ok(find(table, (node) => node.tag === "caption")!.children.length > 0);
  const rows = walk(table).filter((node) => node.tag === "tr");
  assert.equal(rows.length, data.detectors.length + 1);
  const bodyRows = walk(find(table, (node) => node.tag === "tbody")!);
  for (const row of bodyRows.filter((node) => node.tag === "tr")) {
    const rowHeader = find(row, (node) => node.tag === "th")!;
    assert.equal(rowHeader.attributes.get("scope"), "row");
    assert.equal(row.children.filter((node): node is ElementNode => node.kind === "element" && node.tag === "td").length, api.COLUMNS.length);
  }
  const minimums = api.buildMinimums(doc, data);
  assert.equal(walk(minimums).filter((node) => node.tag === "tr").length, 3);
});

test("the real data renders every detector with its counts", () => {
  const doc = fakeDocument();
  const table = api.buildTable(doc, data);
  const body = walk(find(table, (node) => node.tag === "tbody")!);
  const headers = body.filter((node) => node.tag === "th").map(text);
  assert.deepEqual(headers, data.detectors.map((detector) => detector.id));
  const githubActions = api.rowModel(data.detectors.find((detector) => detector.id === "github-actions")!, data.sources);
  const cells = Object.fromEntries(githubActions.cells.map((cell) => [cell.key, cell.text]));
  assert.equal(cells.precision, "1.0000");
  assert.equal(cells.recall, "1.0000");
  assert.equal(cells.truePositives, "211");
  assert.equal(cells.repositoriesWithFindings, "35");
  assert.equal(cells.zeroFindingRepositories, "2");
});

test("the first limitation is in the HTML and reads without JavaScript", () => {
  const paragraph = /<ul id="limitations-list">([\s\S]*?)<\/ul>/.exec(html)![1]!;
  assert.equal(normalize(paragraph), data.limitations[0]!.replace(/\s+/g, " ").trim());
  assert.ok(html.includes("<noscript>"));
  assert.ok(html.includes('href="data.json"'));
  assert.ok(html.includes('src="dashboard.js"') && html.includes('href="style.css"'));
});

test("a page served over HTTP fills every section and hides the status", async () => {
  const { doc, byId } = fakePage(["status", "data-sections", "run", "detectors-table", "minimums-table", "definitions-list", "limitations-list"]);
  let requested: string | undefined;
  await api.start(doc, (url: string) => {
    requested = url;
    return response(data);
  });
  assert.equal(requested, "data.json");
  assert.match(text(byId.get("run")!), /f76b261/);
  assert.match(text(byId.get("run")!), /not measured/);
  assert.ok(find(byId.get("detectors-table")!, (node) => node.tag === "table"));
  assert.ok(find(byId.get("minimums-table")!, (node) => node.tag === "table"));
  assert.match(text(byId.get("definitions-list")!), /truePositives|True positives/);
  assert.equal(byId.get("limitations-list")!.children.length, data.limitations.length);
  assert.ok(byId.get("status")!.attributes.has("hidden"));
  assert.equal(text(byId.get("status")!), "");
  assert.ok(!byId.get("data-sections")!.attributes.has("hidden"));
});

test("a page opened from disk says how to serve it, instead of failing silently", async () => {
  const { doc, byId } = fakePage(["status", "data-sections", "run", "detectors-table", "minimums-table", "definitions-list", "limitations-list"]);
  await api.start(doc, () => Promise.reject(new TypeError("Failed to fetch")));
  const status = byId.get("status")!;
  assert.ok(!status.attributes.has("hidden"));
  assert.match(text(status), /Serve this folder/);
  assert.match(text(status), /python3 -m http\.server/);
  assert.match(text(status), /published page/);
  assert.ok(walk(status).some((node) => node.tag === "a" && node.attributes.get("href") === "https://arminazimi.github.io/evergreen/dashboard/"));
  assert.ok(byId.get("data-sections")!.attributes.has("hidden"), "the empty sections are hidden");
});

test("a failed request, or data in another schema, is reported with the reason", async () => {
  const ids = ["status", "data-sections", "run", "detectors-table", "minimums-table", "definitions-list", "limitations-list"];
  const notFound = fakePage(ids);
  await api.start(notFound.doc, () => response({}, 404));
  assert.match(text(notFound.byId.get("status")!), /HTTP 404/);

  const wrongSchema = fakePage(ids);
  await api.start(wrongSchema.doc, () => response({ schemaVersion: "old" }));
  assert.match(text(wrongSchema.byId.get("status")!), /schemaVersion/);
});

test("a run is stale only after 14 days, counting from the recorded age", () => {
  const at = (days: unknown) => ({ date: "2026-10-18", runAgeDays: days });
  assert.equal(api.STALE_AFTER_DAYS, 14);
  assert.equal(api.isStale(at(13)), false);
  assert.equal(api.isStale(at(14)), false);
  assert.equal(api.isStale(at(15)), true);
  assert.equal(api.isStale(at(100)), true);
  assert.equal(api.runAgeDays(at(0)), 0);
  assert.equal(api.runAgeDays(at(15)), 15);
  for (const missing of [null, {}, { runAgeDays: "15" }, { runAgeDays: -1 }, { runAgeDays: 15.5 }, { runAgeDays: null }]) {
    assert.equal(api.isStale(missing), false, JSON.stringify(missing));
    assert.equal(api.runAgeDays(missing), null, JSON.stringify(missing));
  }
});

test("the stale badge carries the run date and appears only past the limit", () => {
  const doc = fakeDocument();
  const withAge = (days: number, referenceDay: string) => ({
    ...data,
    referenceDay,
    run: { ...data.run, date: "2026-10-18", runAgeDays: days },
  });
  const now = new Date(2026, 10, 1, 12);

  const fresh = api.buildRun(doc, withAge(14, "2026-11-01"), now);
  assert.equal(find(fresh, (node) => node.tag === "strong" && node.attributes.get("class") === "badge"), undefined);
  assert.match(text(fresh), /Computed on 2026-11-01\./);
  assert.doesNotMatch(text(fresh), /stale/);
  assert.ok(find(fresh, (node) => node.tag === "a" && node.attributes.get("href") === "#def-runAge"), "run age links its definition");
  assert.match(text(fresh), /Run age definition14 days/);

  const stale = api.buildRun(doc, withAge(15, "2026-11-02"), now);
  const badge = find(stale, (node) => node.tag === "strong" && node.attributes.get("class") === "badge");
  assert.ok(badge, "a 15-day run is badged");
  assert.equal(text(badge!), "stale");
  assert.match(text(stale), /Last full run 2026-10-18, 15 days old\./);
  assert.ok(find(stale, (node) => node.tag === "time" && node.attributes.get("datetime") === "2026-10-18"));
  assert.match(text(stale), /Computed on 2026-11-02\./);
});

test("a visitor-clock age is extra text and never decides the badge", () => {
  const doc = fakeDocument();
  const aged = (days: number) => ({
    ...data,
    referenceDay: "2026-10-20",
    run: { ...data.run, date: "2026-10-18", runAgeDays: days },
  });

  const agrees = api.buildRun(doc, aged(14), new Date(2026, 10, 1, 12));
  assert.equal(find(agrees, (node) => node.attributes.get("class") === "visitor-clock"), undefined, "no note when the clocks agree");

  const differs = api.buildRun(doc, aged(14), new Date(2026, 10, 2, 1));
  const note = find(differs, (node) => node.attributes.get("class") === "visitor-clock");
  assert.ok(note, "a different clock is reported");
  assert.match(text(note!), /Your device's clock reads the run as 15 days old; the data file records 14 days\./);
  assert.match(text(note!), /not your clock, decides whether the run is marked stale/);
  assert.equal(
    find(differs, (node) => node.tag === "strong" && node.attributes.get("class") === "badge"),
    undefined,
    "a visitor-clock age above the limit does not make the badge",
  );
});

test("run status reads the recorded age and the reference day", () => {
  assert.deepEqual({ ...api.runStatus({ ...data, referenceDay: "2026-11-02", run: { ...data.run, runAgeDays: 15 } }, new Date(2026, 10, 3)) }, {
    stale: true,
    ageDays: 15,
    runDate: "2026-10-19",
    referenceDay: "2026-11-02",
    visitorAgeDays: 15,
    staleAfterDays: 14,
  });
  assert.equal(api.runStatus({ run: null, referenceDay: "2026-11-02" }, new Date()).stale, false);
  assert.equal(api.visitorAgeDays({ date: "2026-10-18" }, new Date(2026, 9, 17)), null, "a run in the future has no age");
  assert.equal(api.visitorAgeDays({ date: "18/10/2026" }, new Date()), null);
  assert.equal(api.visitorAgeDays({ date: "2026-10-18" }, "not a date"), null);
});

test("the page loads nothing from elsewhere and is not in the sitemap", async () => {
  for (const tag of html.match(/<(script|link|img|iframe)[^>]*>/g) ?? []) {
    assert.doesNotMatch(tag, /https?:|\/\//, tag);
  }
  assert.doesNotMatch(css, /@import|url\(|https?:/);
  assert.equal((script.match(/"data\.json"/g) ?? []).length, 1, "one request target: data.json");
  const urls = [...script.matchAll(/https?:\/\/[^\s"'`]+/g)].map((match) => match[0]);
  assert.ok(urls.length > 0);
  for (const url of urls) assert.ok(url.startsWith(api.BLOB_URL) || url === "https://arminazimi.github.io/evergreen/dashboard/", url);
  assert.doesNotMatch(script, /XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  const sitemap = await readFile(resolve("docs/sitemap.xml"), "utf8");
  assert.doesNotMatch(sitemap, /dashboard/);
  for (const id of ["status", "data-sections", "run", "detectors-table", "minimums-table", "definitions-list", "limitations-list"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
});
