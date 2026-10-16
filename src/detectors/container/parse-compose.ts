import { LineCounter, isMap, isScalar, parseDocument, visit } from "yaml";

import { isInterpolated, parseImageReference } from "./parse-image.js";

/**
 * Pure, bounded parser for `services.*.image` in Compose files.
 *
 * Only a literal string at `services.<name>.image` is read. Interpolated values
 * (`${IMAGE}`) are returned as `dynamic`; they are never expanded. Other keys
 * that happen to hold image-looking text (labels, container_name, extension
 * fields), YAML aliases, merge-key expansion, and invalid YAML produce nothing.
 * The parser never evaluates contents or executes tools.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;

export interface ComposeImageDeclaration {
  kind: "image";
  value: string;
  line: number;
}

export interface ComposeDynamicDeclaration {
  kind: "dynamic";
  value: string;
  line: number;
}

export type ComposeDeclaration = ComposeImageDeclaration | ComposeDynamicDeclaration;

/** Parse service image declarations without file, network, or process I/O. */
export function parseCompose(contents: string): ComposeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];

    // Aliases would make a line point at text that is not the value; read none.
    let aliased = false;
    visit(document, { Alias: () => { aliased = true; return visit.BREAK; } });
    if (aliased) return [];

    const services = document.contents.get("services", true);
    if (!isMap(services)) return [];

    const declarations: ComposeDeclaration[] = [];
    for (const service of services.items) {
      if (!isMap(service.value)) continue;
      const image = service.value.get("image", true);
      if (!isScalar(image) || typeof image.value !== "string" || !image.range) continue;
      const value = image.value.trim();
      const line = lineCounter.linePos(image.range[0]).line;
      if (isInterpolated(value)) declarations.push({ kind: "dynamic", value, line });
      else if (parseImageReference(value)) declarations.push({ kind: "image", value, line });
    }
    return declarations;
  } catch {
    return [];
  }
}
