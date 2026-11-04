import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { LineCounter, Scalar, isMap, isNode, isScalar, isSeq, parseAllDocuments, visit } from "yaml";
import type { Document, Pair, YAMLMap, YAMLSeq } from "yaml";

import { renderDiff } from "../../agent-instructions.js";
import { MAXIMUM_DOCUMENTS, MAXIMUM_INPUT_BYTES } from "../../detectors/kubernetes/parse-manifest.js";
import type { Finding } from "../../domain.js";
import type { FilePatch, Fixer, Refuse } from "../index.js";

/**
 * Moves an Ingress from `extensions/v1beta1` or `networking.k8s.io/v1beta1` to `networking.k8s.io/v1`.
 * The Kubernetes Deprecated API Migration Guide names three field changes beside the `apiVersion`:
 * `spec.backend` becomes `spec.defaultBackend`, each backend's `serviceName` and `servicePort` become
 * `service.name` and `service.port.number` (or `service.port.name`), and `pathType` becomes required
 * with the value `ImplementationSpecific` standing for the matching v1beta1 did.
 * Source: https://kubernetes.io/docs/reference/using-api/deprecation-guide/#ingress-v122
 */

const INGRESS_RULE_IDS = new Set([
  "kubernetes.extensions.ingress.v1beta1.removed",
  "kubernetes.networking-k8s-io.ingress.v1beta1.removed",
]);
const LEGACY_API_VERSIONS = new Set(["extensions/v1beta1", "networking.k8s.io/v1beta1"]);
const INGRESS_API_VERSION = "networking.k8s.io/v1";
/** Why a manifest is left alone because its text is a template Evergreen does not render. */
const HELM_REASON = "The Ingress is a Helm template, which Evergreen does not render.";
/** The `pathType` that keeps the routing a v1beta1 path without one had, per the guide above. */
const PATH_TYPE = "pathType: ImplementationSpecific";
const PATH_FIELDS = new Set(["backend", "path", "pathType"]);
const PORT_NUMBER = /^[1-9][0-9]{0,4}$/;
/** The port name `servicePort` accepted as a string, which `port.name` in v1 still requires. */
const PORT_NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** One contiguous run of source lines, 1-based and inclusive, replaced by new text. */
interface Rewrite {
  start: number;
  end: number;
  lines: string[];
}

/** The manifest as written, with the line and column lookup the parser that read it used. */
interface Source {
  contents: string;
  lines: string[];
  documents: Document.Parsed[];
  at(offset: number): { line: number; col: number };
}

/** Why a manifest was left exactly as it is. */
interface Refusal {
  reason: string;
}

/** A scalar the rewrite can copy: resolved, written on one line, with its position. */
interface InlineValue {
  /** The value as YAML resolves it. */
  value: string;
  /** The value as the file writes it, quotes included. */
  text: string;
  /** The quote character it was written with, or the empty string for a plain scalar. */
  quote: string;
  /** The `# comment` written after the value on the same line, or the empty string. */
  comment: string;
  line: number;
  column: number;
}

interface Ingress {
  document: Document.Parsed;
  map: YAMLMap;
  apiVersion: InlineValue;
}

function position(source: Source, node: unknown): { line: number; column: number } | undefined {
  if (!isNode(node)) return undefined;
  const offset = node.range?.[0];
  if (offset === undefined) return undefined;
  const at = source.at(offset);
  return { line: at.line, column: at.col };
}

/** The pair written for `key`, or undefined when the mapping does not hold that key. */
function pairOf(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((item) => isScalar(item.key) && item.key.value === key);
}

/** The field name a pair was written with, for the fields the rewrite must recognize. */
function keyName(pair: Pair): string {
  return isScalar(pair.key) && typeof pair.key.value === "string" ? pair.key.value : "";
}

/** The value as one line of text, or the reason the rewrite cannot copy it. */
function inlineValue(source: Source, node: unknown, what: string): InlineValue | Refusal {
  const unsupported: Refusal = { reason: `The ${what} is not written on one line.` };
  if (!isScalar(node) || !node.range) return unsupported;
  if (node.type !== Scalar.PLAIN && node.type !== Scalar.QUOTE_DOUBLE && node.type !== Scalar.QUOTE_SINGLE)
    return unsupported;
  const start = source.at(node.range[0]);
  if (start.line !== source.at(node.range[1]).line) return unsupported;
  const resolved =
    typeof node.value === "string" ? node.value : typeof node.value === "number" ? String(node.value) : "";
  if (resolved.length === 0) return unsupported;
  const text = source.contents.slice(node.range[0], node.range[1]);
  const opening = text.charAt(0);
  const quote = opening === '"' || opening === "'" ? opening : "";
  const endOfLine = source.contents.indexOf("\n", node.range[1]);
  const tail = source.contents.slice(node.range[1], endOfLine === -1 ? undefined : endOfLine).trim();
  return {
    value: resolved,
    text,
    quote,
    comment: tail.startsWith("#") ? ` ${tail}` : "",
    line: start.line,
    column: start.col,
  };
}

/** The block mapping a node was written as, or the reason it cannot be rewritten line by line. */
function blockMapping(source: Source, node: unknown, what: string): YAMLMap | Refusal {
  if (!isMap(node)) return { reason: `The ${what} is not a block mapping.` };
  const opening = node.range === null || node.range === undefined ? undefined : source.contents[node.range[0]];
  if (opening === "{" || opening === "[") return { reason: `The ${what} is written in flow style.` };
  return node;
}

/** The block sequence a node was written as, or the reason it cannot be rewritten line by line. */
function blockSequence(source: Source, node: unknown, what: string): YAMLSeq | Refusal {
  if (!isSeq(node)) return { reason: `The ${what} is not a block sequence.` };
  const opening = node.range === null || node.range === undefined ? undefined : source.contents[node.range[0]];
  if (opening === "{" || opening === "[") return { reason: `The ${what} is written in flow style.` };
  return node;
}

/** True when any node in the document declares an anchor or reads one back. */
function usesAnchor(document: Document.Parsed): boolean {
  let anchored = false;
  visit(document, {
    Alias() {
      anchored = true;
      return visit.BREAK;
    },
    Node(_key, node) {
      if (node.anchor !== undefined) {
        anchored = true;
        return visit.BREAK;
      }
      return undefined;
    },
  });
  return anchored;
}

function leadingWhitespace(line: string): string {
  return line.slice(0, line.length - line.trimStart().length);
}

/** Why this Ingress cannot be rewritten in place, read before any of its fields are touched. */
function documentRefusal(source: Source, document: Document.Parsed): string | undefined {
  const range = document.range ?? [0, source.contents.length];
  const lines = source.lines.slice(source.at(range[0]).line - 1, source.at(range[1]).line);
  if (lines.some((line) => line.includes("{{"))) return HELM_REASON;
  if (usesAnchor(document)) return "The Ingress uses a YAML anchor or alias.";
  if (lines.some((line) => leadingWhitespace(line).includes("\t")))
    return "The document is not indented with consistent spaces.";
  return undefined;
}

/** The Ingress document whose `apiVersion` sits on `line`. */
function ingressAt(source: Source, line: number): Ingress | Refusal {
  for (const document of source.documents) {
    if (!isMap(document.contents)) continue;
    const kind = document.contents.get("kind", true);
    if (!isScalar(kind) || typeof kind.value !== "string" || kind.value !== "Ingress") continue;
    const apiVersion = inlineValue(source, document.contents.get("apiVersion", true), "`apiVersion` value");
    if ("reason" in apiVersion) continue;
    if (apiVersion.line === line && LEGACY_API_VERSIONS.has(apiVersion.value)) {
      return { document, map: document.contents, apiVersion };
    }
  }
  return { reason: "The line no longer holds the `apiVersion` of a legacy Ingress." };
}

/** The line a key sits on with that key renamed, its value and every other byte kept. */
function renameKey(source: Source, pair: Pair, from: string, to: string): { text: string } | Refusal {
  const key = inlineValue(source, pair.key, `\`${from}\` key`);
  if ("reason" in key) return key;
  const original = source.lines[key.line - 1] ?? "";
  const before = original.slice(0, key.column - 1);
  const after = original.slice(key.column - 1 + key.text.length);
  return { text: `${before}${key.quote}${to}${key.quote}${after}` };
}

/** The `port:` block for a `servicePort`, which was either a port number or a port name. */
function portBlock(port: InlineValue, pad: string, inner: string): string[] | Refusal {
  if (port.quote !== "")
    return { reason: "The `servicePort` is quoted, so its number and its name are not distinguishable." };
  if (PORT_NUMBER.test(port.value)) {
    const number = Number(port.value);
    if (number < 1 || number > 65_535) return { reason: "The `servicePort` is outside the range of a port number." };
    return [`${pad}port:`, `${inner}number: ${port.value}${port.comment}`];
  }
  if (!PORT_NAME.test(port.value)) return { reason: "The `servicePort` is neither a port number nor a port name." };
  return [`${pad}port:`, `${inner}name: ${port.value}${port.comment}`];
}

/** The `serviceName` and `servicePort` of a backend, or the reason it is not the pair this rewrite knows. */
function backendValues(source: Source, mapping: YAMLMap): { name: InlineValue; port: InlineValue } | Refusal {
  if (pairOf(mapping, "resource")) return { reason: "The backend points at a `resource`, which has no v1 equivalent." };
  if (mapping.items.length !== 2) return { reason: "The backend has a field this rewrite does not handle." };
  const name = pairOf(mapping, "serviceName");
  const port = pairOf(mapping, "servicePort");
  if (!name || !port) return { reason: "The backend does not pair `serviceName` with `servicePort`." };
  const nameValue = inlineValue(source, name.value, "`serviceName` value");
  if ("reason" in nameValue) return nameValue;
  const portValue = inlineValue(source, port.value, "`servicePort` value");
  if ("reason" in portValue) return portValue;
  return { name: nameValue, port: portValue };
}

/** The v1 `service:` block that replaces a v1beta1 backend's `serviceName` and `servicePort`. */
function serviceBlock(name: InlineValue, port: InlineValue, column: number, step: number): string[] | Refusal {
  const pad = " ".repeat(column - 1);
  const inner = " ".repeat(column - 1 + step);
  const moved = portBlock(port, inner, " ".repeat(column - 1 + 2 * step));
  if ("reason" in moved) return moved;
  return [`${pad}service:`, `${inner}name: ${name.text}${name.comment}`, ...moved];
}

/** The rewrite of one backend block, renaming the key that holds it when the field changed its name. */
function backendRewrite(source: Source, pair: Pair, mapping: YAMLMap, rename: string | undefined): Rewrite | Refusal {
  const values = backendValues(source, mapping);
  if ("reason" in values) return values;
  const name = position(source, pairOf(mapping, "serviceName")?.key);
  const port = position(source, pairOf(mapping, "servicePort")?.key);
  const key = position(source, pair.key);
  if (!name || !port || !key) return { reason: "The backend is not written with its fields on their own lines." };
  const start = Math.min(name.line, port.line);
  if (Math.max(name.line, port.line) !== start + 1)
    return { reason: "The `serviceName` and the `servicePort` are not on adjacent lines." };
  if (name.column !== port.column) return { reason: "The document is not indented with consistent spaces." };
  const step = name.column - key.column;
  if (step < 1) return { reason: "The backend's fields are not indented under it." };
  const lines = serviceBlock(values.name, values.port, name.column, step);
  if ("reason" in lines) return lines;
  if (rename === undefined) return { start, end: Math.max(name.line, port.line), lines };
  const renamed = renameKey(source, pair, "backend", rename);
  if ("reason" in renamed) return renamed;
  return { start: key.line, end: Math.max(name.line, port.line), lines: [renamed.text, ...lines] };
}

/** The `pathType` line, anchored after the path it describes or first when the path names none. */
function pathTypeRewrite(source: Source, item: YAMLMap): Rewrite | Refusal {
  const path = pairOf(item, "path");
  const anchor = path ?? item.items[0];
  const at = anchor === undefined ? undefined : position(source, anchor.key);
  if (!at) return { reason: "The path has no field to anchor the `pathType` to." };
  const original = source.lines[at.line - 1] ?? "";
  const indent = " ".repeat(at.column - 1);
  if (path !== undefined) return { start: at.line, end: at.line, lines: [original, `${indent}${PATH_TYPE}`] };
  return {
    start: at.line,
    end: at.line,
    lines: [`${original.slice(0, at.column - 1)}${PATH_TYPE}`, `${indent}${original.slice(at.column - 1)}`],
  };
}

/** The rewrites one `paths` entry needs: the `pathType` v1 requires and its backend. */
function pathRewrites(source: Source, item: YAMLMap): Rewrite[] | Refusal {
  const unknown = item.items.find((entry) => !PATH_FIELDS.has(keyName(entry)));
  if (unknown) return { reason: "The path has a field this rewrite does not handle." };
  const backend = pairOf(item, "backend");
  if (!backend) return { reason: "The path has no backend to rewrite." };
  const mapping = blockMapping(source, backend.value, "backend");
  if ("reason" in mapping) return mapping;
  const rewrites: Rewrite[] = [];
  if (!pairOf(item, "pathType")) {
    const pathType = pathTypeRewrite(source, item);
    if ("reason" in pathType) return pathType;
    rewrites.push(pathType);
  }
  const moved = backendRewrite(source, backend, mapping, undefined);
  if ("reason" in moved) return moved;
  rewrites.push(moved);
  return rewrites;
}

function httpRewrites(source: Source, rule: YAMLMap): Rewrite[] | Refusal {
  const http = pairOf(rule, "http");
  if (!http) return [];
  const mapping = blockMapping(source, http.value, "`http`");
  if ("reason" in mapping) return mapping;
  const paths = pairOf(mapping, "paths");
  if (!paths) return [];
  const sequence = blockSequence(source, paths.value, "`paths`");
  if ("reason" in sequence) return sequence;
  const rewrites: Rewrite[] = [];
  for (const entry of sequence.items) {
    const item = blockMapping(source, entry, "path");
    if ("reason" in item) return item;
    const moved = pathRewrites(source, item);
    if ("reason" in moved) return moved;
    rewrites.push(...moved);
  }
  return rewrites;
}

function rulesRewrites(source: Source, rules: YAMLSeq): Rewrite[] | Refusal {
  const rewrites: Rewrite[] = [];
  for (const entry of rules.items) {
    const rule = blockMapping(source, entry, "rule");
    if ("reason" in rule) return rule;
    const moved = httpRewrites(source, rule);
    if ("reason" in moved) return moved;
    rewrites.push(...moved);
  }
  return rewrites;
}

/** The rewrites of the Ingress fields beside its `apiVersion`: the default backend and every path. */
function specRewrites(source: Source, spec: YAMLMap): Rewrite[] | Refusal {
  const rewrites: Rewrite[] = [];
  const backend = pairOf(spec, "backend");
  if (backend) {
    const mapping = blockMapping(source, backend.value, "`spec.backend`");
    if ("reason" in mapping) return mapping;
    const renamed = backendRewrite(source, backend, mapping, "defaultBackend");
    if ("reason" in renamed) return renamed;
    rewrites.push(renamed);
  }
  const rules = pairOf(spec, "rules");
  if (!rules) return rewrites;
  const sequence = blockSequence(source, rules.value, "`spec.rules`");
  if ("reason" in sequence) return sequence;
  const moved = rulesRewrites(source, sequence);
  if ("reason" in moved) return moved;
  return [...rewrites, ...moved];
}

function ingressRewrites(source: Source, ingress: Ingress): Rewrite[] | Refusal {
  const original = source.lines[ingress.apiVersion.line - 1] ?? "";
  const before = original.slice(0, ingress.apiVersion.column - 1);
  const after = original.slice(ingress.apiVersion.column - 1 + ingress.apiVersion.text.length);
  const quote = ingress.apiVersion.quote;
  const apiVersion: Rewrite = {
    start: ingress.apiVersion.line,
    end: ingress.apiVersion.line,
    lines: [`${before}${quote}${INGRESS_API_VERSION}${quote}${after}`],
  };
  const spec = pairOf(ingress.map, "spec");
  if (!spec) return [apiVersion];
  const mapping = blockMapping(source, spec.value, "`spec`");
  if ("reason" in mapping) return mapping;
  const moved = specRewrites(source, mapping);
  if ("reason" in moved) return moved;
  return [apiVersion, ...moved];
}

/** Replace each rewritten run of lines with its new text and keep every other line byte for byte. */
function applyRewrites(lines: string[], rewrites: Rewrite[]): string[] {
  const applied: string[] = [];
  let cursor = 0;
  for (const rewrite of [...rewrites].sort((left, right) => left.start - right.start)) {
    applied.push(...lines.slice(cursor, rewrite.start - 1));
    applied.push(...rewrite.lines);
    cursor = rewrite.end;
  }
  return [...applied, ...lines.slice(cursor)];
}

function parseSource(contents: string): Source | Refusal {
  const counter = new LineCounter();
  try {
    const parsed = parseAllDocuments(contents, { lineCounter: counter, merge: false });
    const documents = Array.isArray(parsed) ? parsed : [parsed];
    if (documents.some((document) => document.errors.length > 0)) return { reason: "The manifest is not valid YAML." };
    if (documents.length > MAXIMUM_DOCUMENTS)
      return { reason: "The manifest has more documents than Evergreen rewrites." };
    return { contents, lines: contents.split("\n"), documents, at: (offset) => counter.linePos(offset) };
  } catch {
    return { reason: "The manifest is not valid YAML." };
  }
}

interface Target {
  finding: Finding;
  line: number;
}

/** The manifest as read, with the rewrites its Ingress findings ask for. */
interface FileRewrites {
  contents: string;
  lines: string[];
  rewrites: Rewrite[];
}

/** The legacy Ingress findings of a scan, grouped by the manifest that holds them, in scan order. */
function targetsByPath(findings: Finding[], refuse: Refuse | undefined): Map<string, Target[]> {
  const byPath = new Map<string, Target[]>();
  for (const finding of findings) {
    if (finding.detector !== "kubernetes" || !INGRESS_RULE_IDS.has(finding.ruleId)) continue;
    if (finding.location.line === undefined) {
      refuse?.(finding, "The finding names no line to rewrite.");
      continue;
    }
    const existing = byPath.get(finding.location.path) ?? [];
    existing.push({ finding, line: finding.location.line });
    byPath.set(finding.location.path, existing);
  }
  return byPath;
}

/** The rewrites one manifest needs, or nothing when the whole file is declined. */
async function rewritesForFile(
  root: string,
  path: string,
  targets: Target[],
  refuse: Refuse | undefined,
): Promise<FileRewrites | undefined> {
  const decline = (reason: string) => {
    for (const target of targets) refuse?.(target.finding, reason);
    return undefined;
  };
  const absolute = resolve(root, path);
  const inside = relative(resolve(root), absolute);
  if (inside.startsWith("..") || isAbsolute(inside)) return decline("The path resolves outside the repository.");
  const contents = await readFile(absolute, "utf8").catch(() => undefined);
  if (contents === undefined) return decline("The manifest could not be read.");
  if (!contents.endsWith("\n")) return decline("The manifest does not end with a newline.");
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES)
    return decline("The manifest is larger than Evergreen reads.");
  const source = parseSource(contents);
  // A chart template is not valid YAML on its own; its own refusal reads truer than a syntax error.
  if ("reason" in source) return decline(contents.includes("{{") ? HELM_REASON : source.reason);

  const rewrites: Rewrite[] = [];
  for (const target of targets) {
    const ingress = ingressAt(source, target.line);
    if ("reason" in ingress) {
      refuse?.(target.finding, ingress.reason);
      continue;
    }
    const refusal = documentRefusal(source, ingress.document);
    if (refusal !== undefined) {
      refuse?.(target.finding, refusal);
      continue;
    }
    const moved = ingressRewrites(source, ingress);
    if ("reason" in moved) refuse?.(target.finding, moved.reason);
    else rewrites.push(...moved);
  }
  return { contents, lines: source.lines, rewrites };
}

/**
 * Moves a legacy Ingress to `networking.k8s.io/v1` with its backend fields and its `pathType` values.
 * The document is edited on the lines the fields are written on, so a comment written after a rewritten
 * value moves with it and the blank lines and key order of every untouched field survive; the YAML is
 * never re-serialized. A Helm template, an anchor or an alias, a flow-style collection, a `resource:`
 * backend, a backend that is not the `serviceName` and `servicePort` pair on adjacent lines, a quoted or
 * out-of-range `servicePort`, and tab indentation are refused with the reason instead of guessed.
 * `src/fix/kubernetes.ts` leaves these findings alone, so exactly one fixer rewrites any Ingress.
 */
export const kubernetesIngressV1Fixer: Fixer = {
  id: "kubernetes-ingress-v1",
  async plan(result, refuse) {
    const grouped = [...targetsByPath(result.findings, refuse)].sort(([left], [right]) => left.localeCompare(right));
    const patches: FilePatch[] = [];
    for (const [path, targets] of grouped) {
      const file = await rewritesForFile(result.root, path, targets, refuse);
      if (file === undefined || file.rewrites.length === 0) continue;
      const text = applyRewrites(file.lines, file.rewrites).join("\n");
      // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
      if (text !== file.contents)
        patches.push({ path, diff: renderDiff(path, file.contents.slice(0, -1), text.slice(0, -1)) });
    }
    return patches;
  },
};
