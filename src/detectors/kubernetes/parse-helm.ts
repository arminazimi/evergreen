import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { YAMLMap } from "yaml";

import { required } from "../../required.js";
import { isKind, splitApiVersion } from "./api-version.js";
import type { ApiDeclaration } from "./parse-manifest.js";

/**
 * Pure, bounded parsers for Helm charts: `kubeVersion` and `dependencies` in `Chart.yaml`,
 * and literal `apiVersion`/`kind` pairs in `templates/*.yaml`.
 *
 * A template is not YAML until Helm renders it, and Evergreen never renders it. The
 * template parser reads the file as text: template actions are masked, the control
 * blocks (`if`, `with`, `range`, `define`) are tracked, and a column-0 `apiVersion:` and
 * `kind:` are read only when both are literal and neither sits in a block that
 * asks the cluster what it supports (`.Capabilities`, `include`, `template`, `tpl`,
 * `lookup`). Those blocks are the compatibility ladder charts use to keep a legacy
 * API for old clusters; reporting the legacy branch would be wrong. Conditions on
 * `.Values` do not make a declaration dynamic. Values from `.Values` or a helper are
 * dynamic, a document with two `apiVersion` lines is skipped, and a template with
 * unbalanced or unterminated actions yields nothing.
 *
 * Chart dependencies whose `name`, `version`, or `repository` contain a template action,
 * or whose repository is a Helm alias (`@stable`), are returned as unclassified rather
 * than guessed. Local file dependencies and unknown repositories produce no declaration.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DOCUMENTS = 500;
export const MAXIMUM_ACTIONS = 20_000;
export const MAXIMUM_NESTING = 64;
export const MAXIMUM_DEPENDENCIES = 500;

export interface KubeVersionDeclaration {
  kind: "kubeVersion";
  /** The constraint as written, for example `>=1.19.0-0 <1.22.0-0`. */
  value: string;
  /** One-based line of the value. */
  line: number;
}

export interface ChartDependencyDeclaration {
  kind: "dependency";
  /** Chart name as written. */
  name: string;
  /** Version constraint when literal; undefined when omitted. */
  version: string | undefined;
  /** Repository URL when literal; undefined when omitted. */
  repository: string | undefined;
  /** One-based line of the `name` field (or the mapping when name has no range). */
  line: number;
}

export interface ChartUnclassifiedReference {
  /** The field value that could not be judged. */
  value: string;
  /** One-based line of that value. */
  line: number;
  reason: string;
}

export interface ChartParseResult {
  kubeVersions: KubeVersionDeclaration[];
  dependencies: ChartDependencyDeclaration[];
  unclassified: ChartUnclassifiedReference[];
}

const EMPTY_CHART: ChartParseResult = { kubeVersions: [], dependencies: [], unclassified: [] };

/** Read a scalar string with its line; undefined when the node is not a bounded string. */
function scalarField(node: unknown, lines: LineCounter): { value: string; line: number } | undefined {
  if (!isScalar(node) || !node.range) return undefined;
  const raw: unknown = node.value;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (value.length === 0 || value.length > 256) return undefined;
  return { value, line: lines.linePos(node.range[0]).line };
}

/** The top-level `kubeVersion` when it is a literal, with its line. */
function readKubeVersions(chart: YAMLMap, lines: LineCounter): KubeVersionDeclaration[] {
  const kube = scalarField(chart.get("kubeVersion", true), lines);
  if (!kube || kube.value.includes("{{")) return [];
  return [{ kind: "kubeVersion", value: kube.value, line: kube.line }];
}

/** The first dependency field that is a template action, which keeps the dependency unclassified. */
function templatedField(
  fields: Array<{ value: string; line: number } | undefined>,
): { value: string; line: number } | undefined {
  return fields.find((field) => field?.value.includes("{{"));
}

/** One dependency entry as a declaration, an unclassified reference, or nothing to report. */
function readDependency(
  item: YAMLMap,
  lines: LineCounter,
): ChartDependencyDeclaration | ChartUnclassifiedReference | undefined {
  const name = scalarField(item.get("name", true), lines);
  if (!name) return undefined;
  const version = scalarField(item.get("version", true), lines);
  const repository = scalarField(item.get("repository", true), lines);

  const templated = templatedField([name, version, repository]);
  if (templated) {
    return {
      value: templated.value,
      line: templated.line,
      reason: "the dependency field is a Helm template action, which Evergreen does not evaluate",
    };
  }
  if (repository?.value.startsWith("@")) {
    return { value: repository.value, line: repository.line, reason: "Helm repository aliases are not resolved" };
  }
  return {
    kind: "dependency",
    name: name.value,
    version: version?.value,
    repository: repository?.value,
    line: name.line,
  };
}

/** The bounded `dependencies` of a `Chart.yaml`, split into declarations and unclassified references. */
function readDependencies(
  chart: YAMLMap,
  lines: LineCounter,
): { dependencies: ChartDependencyDeclaration[]; unclassified: ChartUnclassifiedReference[] } {
  const dependencies: ChartDependencyDeclaration[] = [];
  const unclassified: ChartUnclassifiedReference[] = [];
  const node = chart.get("dependencies", true);
  if (!isSeq(node)) return { dependencies, unclassified };

  for (const item of node.items) {
    if (dependencies.length + unclassified.length >= MAXIMUM_DEPENDENCIES) break;
    if (!isMap(item)) continue;
    const entry = readDependency(item, lines);
    if (!entry) continue;
    if ("kind" in entry) dependencies.push(entry);
    else unclassified.push(entry);
  }
  return { dependencies, unclassified };
}

/** Read the top-level `kubeVersion` and `dependencies` of a `Chart.yaml`. */
export function parseChart(contents: string): ChartParseResult {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return EMPTY_CHART;

  try {
    const lines = new LineCounter();
    const document = parseDocument(contents, { lineCounter: lines, merge: false });
    const chart: unknown = document.contents;
    if (document.errors.length > 0 || !isMap(chart)) return EMPTY_CHART;
    return { kubeVersions: readKubeVersions(chart, lines), ...readDependencies(chart, lines) };
  } catch {
    return EMPTY_CHART;
  }
}

const MARKER = "\u0001";

interface Action {
  /** Text between the delimiters, with trim markers removed. */
  text: string;
  /** Zero-based line where the action starts. */
  line: number;
}

/** Start of the action's text after `{{`; Helm honors a trim marker only before whitespace. */
function actionStart(contents: string, open: number): number {
  const cursor = open + 2;
  return contents[cursor] === "-" && /\s/.test(contents[cursor + 1] ?? "") ? cursor + 2 : cursor;
}

function commentActionEnd(contents: string, cursor: number): number | undefined {
  const close = contents.indexOf("*/", cursor);
  if (close < 0) return undefined;
  const tail = /^\s*(?:-\s*)?\}\}/.exec(contents.slice(close + 2));
  return tail ? close + 2 + tail[0].length : undefined;
}

/** The index just past the `}}` that closes an expression, skipping quoted and raw strings. */
function expressionActionEnd(contents: string, cursor: number): number | undefined {
  let quote = "";
  for (let position = cursor; position < contents.length; position++) {
    const character = contents.charAt(position);
    if (quote) {
      if (character === "\\" && quote === '"') position++;
      else if (character === quote) quote = "";
    } else if (character === '"' || character === "`") {
      quote = character;
    } else if (character === "}" && contents[position + 1] === "}") {
      return position + 2;
    }
  }
  return undefined;
}

/** The index just past the action that starts at `open`, or undefined when it is unterminated. */
function actionEnd(contents: string, open: number): number | undefined {
  const cursor = actionStart(contents, open);
  return contents.slice(cursor).trimStart().startsWith("/*")
    ? commentActionEnd(contents, cursor)
    : expressionActionEnd(contents, cursor);
}

interface MaskedAction {
  /** Text between the delimiters, with trim markers removed. */
  text: string;
  comment: boolean;
  end: number;
  newlines: number;
}

/** One action's text and bounds; undefined when it is unterminated or over the limit. */
function readMaskedAction(contents: string, open: number, taken: number): MaskedAction | undefined {
  const end = actionEnd(contents, open);
  if (end === undefined || taken >= MAXIMUM_ACTIONS) return undefined;
  const raw = contents.slice(open, end);
  const text = raw.replace(/^\{\{-?\s*/, "").replace(/\s*-?\}\}$/, "");
  return { text, comment: text.startsWith("/*"), end, newlines: countNewlines(raw) };
}

/** Replace every `{{ ... }}` with a marker, keeping line count; undefined when one is unterminated. */
function maskActions(contents: string): { masked: string; actions: Action[] } | undefined {
  const actions: Action[] = [];
  let masked = "";
  let line = 0;
  let index = 0;
  while (index < contents.length) {
    const open = contents.indexOf("{{", index);
    if (open < 0) {
      masked += contents.slice(index);
      break;
    }
    const before = contents.slice(index, open);
    masked += before;
    line += countNewlines(before);

    const action = readMaskedAction(contents, open, actions.length);
    if (!action) return undefined;
    if (!action.comment) actions.push({ text: action.text, line });
    masked += (action.comment ? "" : MARKER) + "\n".repeat(action.newlines);
    line += action.newlines;
    index = action.end;
  }
  return { masked, actions };
}

function countNewlines(text: string): number {
  let count = 0;
  for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) count++;
  return count;
}

/** Whether a block condition can depend on what the cluster serves. */
function asksCluster(condition: string): boolean {
  return /\.Capabilities\b/.test(condition) || /\b(include|template|tpl|lookup)\b/.test(condition);
}

interface Frame {
  /** An earlier condition in this if/else chain asked the cluster. */
  chain: boolean;
  /** Inside this branch, the declaration is dynamic. */
  guarded: boolean;
}

/** Per-line flag: is the declaration dynamic at the start of this line. Undefined when blocks are unbalanced. */
function guardByLine(actions: Action[], lineCount: number): boolean[] | undefined {
  const guarded = new Array<boolean>(lineCount + 1).fill(false);
  const stack: Frame[] = [];
  let cursor = 0;
  for (let line = 0; line <= lineCount; line++) {
    guarded[line] = stack.some((frame) => frame.guarded);
    while (cursor < actions.length && required(actions[cursor], "the pending action").line === line) {
      const { text } = required(actions[cursor++], "the pending action");
      const word = /^(else\s+(?:if|with)|else|if|with|range|define|block|end)\b\s*(.*)$/s.exec(text);
      if (!word) continue;
      const [, keyword = "", condition = ""] = word;
      if (keyword === "end") {
        if (stack.pop() === undefined) return undefined;
      } else if (keyword.startsWith("else")) {
        const top = stack[stack.length - 1];
        if (!top) return undefined;
        top.chain = top.chain || asksCluster(condition);
        top.guarded = top.chain;
      } else {
        if (stack.length >= MAXIMUM_NESTING) return undefined;
        const chain = keyword === "define" || keyword === "block" || asksCluster(condition);
        stack.push({ chain, guarded: chain });
      }
    }
  }
  return stack.length === 0 ? guarded : undefined;
}

/** A plain or quoted scalar with no markers and no trailing comment. */
function literalValue(raw: string): string | undefined {
  const text = raw.trim();
  if (text.includes(MARKER)) return undefined;
  const quoted = /^(?:"([^"\\]*)"|'([^']*)')\s*(?:#.*)?$/.exec(text);
  if (quoted) return (quoted[1] ?? quoted[2] ?? "").trim();
  if (/^[&*!|>%@`,[\]{}"']/.test(text)) return undefined;
  const plain = text.replace(/\s+#.*$/, "").trim();
  return plain.length > 0 ? plain : undefined;
}

interface Candidate {
  value: string | undefined;
  line: number;
}

/** The declaration of a document with exactly one literal apiVersion and one literal kind. */
function pairedDeclaration(apiVersions: readonly Candidate[], kinds: readonly Candidate[]): ApiDeclaration | undefined {
  if (apiVersions.length !== 1 || kinds.length !== 1) return undefined;
  const apiVersion = required(apiVersions[0], "the only apiVersion key");
  const kind = required(kinds[0], "the only kind key");
  const parts = apiVersion.value === undefined ? undefined : splitApiVersion(apiVersion.value);
  if (!parts || kind.value === undefined || !isKind(kind.value)) return undefined;
  return {
    kind: "api",
    value: required(apiVersion.value, "the apiVersion value"),
    group: parts.group,
    version: parts.version,
    resource: kind.value,
    line: apiVersion.line,
    kindLine: kind.line,
  };
}

/** Read literal `apiVersion` and `kind` pairs from a Helm template without rendering it. */
export function parseTemplate(contents: string): ApiDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const result = maskActions(contents);
    if (!result) return [];
    const lines = result.masked.split(/\r\n|\n|\r/);
    const guarded = guardByLine(result.actions, lines.length - 1);
    if (!guarded) return [];

    const declarations: ApiDeclaration[] = [];
    let documents = 1;
    let apiVersions: Candidate[] = [];
    let kinds: Candidate[] = [];

    const flush = (): void => {
      const declaration = pairedDeclaration(apiVersions, kinds);
      if (declaration) declarations.push(declaration);
      apiVersions = [];
      kinds = [];
    };

    for (const [index, text] of lines.entries()) {
      if (text.length > MAXIMUM_LINE_LENGTH) continue;
      if (/^---(?:\s+#.*|\s*)$/.test(text)) {
        flush();
        if (++documents > MAXIMUM_DOCUMENTS) return [];
        continue;
      }
      const key = /^(apiVersion|kind):(.*)$/.exec(text);
      if (!key) continue;
      // A key inside a cluster-dependent block is recorded as dynamic so the pair is dropped.
      const value = guarded[index] ? undefined : literalValue(required(key[2], "the value text"));
      (key[1] === "apiVersion" ? apiVersions : kinds).push({ value, line: index + 1 });
    }
    flush();
    return declarations;
  } catch {
    return [];
  }
}
