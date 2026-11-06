// Deriving hover cards and quick fixes from the findings attached to one open document.

import type { Finding } from "../domain.js";
import { documentRange, firstSourceUrl, hoverMarkdown, positionInRange, rangesOverlap } from "./diagnostics.js";
import type { OpenDocument } from "./documents.js";
import type { JsonObject, LspPosition } from "./protocol.js";
import {
  EXPLAIN_FINDING_COMMAND,
  OPEN_EVIDENCE_COMMAND,
  asObject,
  asPosition,
  asRange,
  isString,
  stringField,
} from "./protocol.js";

export function hoverResult(document: OpenDocument, position: LspPosition): JsonObject | null {
  const index = findingIndexAt(document, position);
  if (index < 0) return null;
  const finding = document.findings[index];
  const diagnostic = document.diagnostics[index];
  if (!finding || !diagnostic) return null;
  return {
    contents: { kind: "markdown", value: hoverMarkdown(finding, diagnostic.range) },
    range: diagnostic.range,
  };
}

export function codeActionsFor(document: OpenDocument, params: unknown): JsonObject[] {
  const object = asObject(params);
  const context = asObject(object?.context);
  const only = Array.isArray(context?.only) ? context.only.filter(isString) : [];
  if (only.length > 0 && !only.some((kind) => kind === "quickfix" || kind.startsWith("quickfix."))) return [];

  const requested = asRange(object?.range) ?? documentRange(document.text);
  const contextFindings = new Set(
    (Array.isArray(context?.diagnostics) ? context.diagnostics : [])
      .map((diagnostic) => stringField(asObject(asObject(diagnostic)?.data), "findingId"))
      .filter(isString),
  );

  const actions: JsonObject[] = [];
  document.findings.forEach((finding, index) => {
    const diagnostic = document.diagnostics[index];
    if (!diagnostic) return;
    if (!contextFindings.has(finding.id) && !rangesOverlap(requested, diagnostic.range)) return;

    actions.push({
      title: `Evergreen: explain ${finding.title}`,
      kind: "quickfix",
      diagnostics: [diagnostic],
      command: {
        title: "Explain this lifecycle finding with Evergreen",
        command: EXPLAIN_FINDING_COMMAND,
        arguments: [finding.id, document.uri],
      },
    });

    const url = firstSourceUrl(finding);
    if (url) {
      actions.push({
        title: `Evergreen: open evidence for ${finding.ruleId}`,
        kind: "quickfix",
        diagnostics: [diagnostic],
        command: {
          title: "Open the lifecycle evidence with Evergreen",
          command: OPEN_EVIDENCE_COMMAND,
          arguments: [url],
        },
      });
    }
  });
  return actions;
}

export function findingById(documents: Iterable<OpenDocument>, id: unknown, uri: unknown): Finding | undefined {
  if (typeof id !== "string") return undefined;
  const open = [...documents];
  if (typeof uri === "string") {
    const document = open.find((candidate) => candidate.uri === uri);
    const found = document?.findings.find((finding) => finding.id === id);
    if (found) return found;
  }
  for (const document of open) {
    const found = document.findings.find((finding) => finding.id === id);
    if (found) return found;
  }
  return undefined;
}

function findingIndexAt(document: OpenDocument, position: LspPosition): number {
  const inside = document.diagnostics.findIndex((diagnostic) => positionInRange(position, diagnostic.range));
  if (inside >= 0) return inside;
  return document.diagnostics.findIndex((diagnostic) => diagnostic.range.start.line === position.line);
}

export function hoverAt(document: OpenDocument, params: unknown): JsonObject | null {
  const position = asPosition(asObject(asObject(params)?.position));
  return position ? hoverResult(document, position) : null;
}
