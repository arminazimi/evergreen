import { LineCounter, isMap, isScalar, parseDocument } from "yaml";

import { isKind, splitApiVersion } from "./api-version.js";
import type { ApiDeclaration } from "./parse-manifest.js";

/**
 * Pure, bounded parsers for Helm charts: `kubeVersion` in `Chart.yaml` and literal
 * `apiVersion`/`kind` pairs in `templates/*.yaml`.
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
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DOCUMENTS = 500;
export const MAXIMUM_ACTIONS = 20_000;
export const MAXIMUM_NESTING = 64;

export interface KubeVersionDeclaration {
  kind: "kubeVersion";
  /** The constraint as written, for example `>=1.19.0-0 <1.22.0-0`. */
  value: string;
  /** One-based line of the value. */
  line: number;
}

/** Read the top-level `kubeVersion` of a `Chart.yaml`. */
export function parseChart(contents: string): KubeVersionDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const lines = new LineCounter();
    const document = parseDocument(contents, { lineCounter: lines, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];
    const node = document.contents.get("kubeVersion", true);
    if (!isScalar(node) || !node.range) return [];
    const raw: unknown = node.value;
    if (typeof raw !== "string") return [];
    const value = raw.trim();
    if (value.length === 0 || value.length > 256 || value.includes("{{")) return [];
    return [{ kind: "kubeVersion", value, line: lines.linePos(node.range[0]).line }];
  } catch {
    return [];
  }
}

const MARKER = "\u0001";

interface Action {
  /** Text between the delimiters, with trim markers removed. */
  text: string;
  /** Zero-based line where the action starts. */
  line: number;
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

    let cursor = open + 2;
    if (contents[cursor] === "-" && /\s/.test(contents[cursor + 1] ?? "")) cursor += 2;
    let end = -1;
    const afterTrim = contents.slice(cursor).trimStart();
    if (afterTrim.startsWith("/*")) {
      const close = contents.indexOf("*/", cursor);
      if (close < 0) return undefined;
      const tail = /^\s*(?:-\s*)?\}\}/.exec(contents.slice(close + 2));
      if (!tail) return undefined;
      end = close + 2 + tail[0].length;
    } else {
      let quote = "";
      for (let position = cursor; position < contents.length; position++) {
        const character = contents[position]!;
        if (quote) {
          if (character === "\\" && quote === '"') position++;
          else if (character === quote) quote = "";
        } else if (character === '"' || character === "`") {
          quote = character;
        } else if (character === "}" && contents[position + 1] === "}") {
          end = position + 2;
          break;
        }
      }
      if (end < 0) return undefined;
    }

    const raw = contents.slice(open, end);
    if (actions.length >= MAXIMUM_ACTIONS) return undefined;
    const text = raw.replace(/^\{\{-?\s*/, "").replace(/\s*-?\}\}$/, "");
    const comment = text.startsWith("/*");
    if (!comment) actions.push({ text, line });
    const newlines = countNewlines(raw);
    masked += (comment ? "" : MARKER) + "\n".repeat(newlines);
    line += newlines;
    index = end;
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
    while (cursor < actions.length && actions[cursor]!.line === line) {
      const { text } = actions[cursor++]!;
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

/** Read literal `apiVersion` and `kind` pairs from a Helm template without rendering it. */
export function parseTemplate(contents: string): ApiDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const result = maskActions(contents);
    if (!result) return [];
    const lines = result.masked.split(/\r\n|\n|\r/);
    const guarded = guardByLine(result.actions, lines.length - 1);
    if (!guarded) return [];

    interface Candidate {
      value: string | undefined;
      line: number;
    }
    const declarations: ApiDeclaration[] = [];
    let documents = 1;
    let apiVersions: Candidate[] = [];
    let kinds: Candidate[] = [];

    const flush = (): void => {
      if (apiVersions.length === 1 && kinds.length === 1) {
        const apiVersion = apiVersions[0]!;
        const kind = kinds[0]!;
        const parts = apiVersion.value === undefined ? undefined : splitApiVersion(apiVersion.value);
        if (parts && kind.value !== undefined && isKind(kind.value)) {
          declarations.push({
            kind: "api",
            value: apiVersion.value!,
            group: parts.group,
            version: parts.version,
            resource: kind.value,
            line: apiVersion.line,
            kindLine: kind.line,
          });
        }
      }
      apiVersions = [];
      kinds = [];
    };

    for (let index = 0; index < lines.length; index++) {
      const text = lines[index]!;
      if (text.length > MAXIMUM_LINE_LENGTH) continue;
      if (/^---(?:\s+#.*|\s*)$/.test(text)) {
        flush();
        if (++documents > MAXIMUM_DOCUMENTS) return [];
        continue;
      }
      const key = /^(apiVersion|kind):(.*)$/.exec(text);
      if (!key) continue;
      // A key inside a cluster-dependent block is recorded as dynamic so the pair is dropped.
      const value = guarded[index] ? undefined : literalValue(key[2]!);
      (key[1] === "apiVersion" ? apiVersions : kinds).push({ value, line: index + 1 });
    }
    flush();
    return declarations;
  } catch {
    return [];
  }
}
