import { required } from "../../required.js";

import type { Declaration } from "./types.js";

export type IniFile = "setup.cfg" | "tox.ini";

/** True for the one option each file keeps its Python runtime in. */
export function isRuntimeOption(name: IniFile, section: string, option: string | undefined): boolean {
  return name === "setup.cfg"
    ? section === "options" && option === "python_requires"
    : section === "tox" && ["envlist", "env_list"].includes(option ?? "");
}

/** The `X.Y` interpreters pinned by tox environment names such as `py312` or `py{39,310}-lint`. */
export function toxPythonVersions(value: string): Set<string> {
  const versions = new Set<string>();
  for (const environment of value.match(/(?:[^,\s{}]+|\{[^{}]*\})+/g) ?? []) {
    const python = /(?:^|-)py(?:(\d)(\d{1,2})|\{(\d{2,3}(?:,\s*\d{2,3})*)\})(?=-|$)/.exec(environment);
    if (!python) continue;
    const pins = python[3]?.split(/,\s*/) ?? [`${python[1]}${python[2]}`];
    for (const pin of pins) versions.add(`${pin[0]}.${Number(pin.slice(1))}`);
  }
  return versions;
}

function iniDeclarations(path: string, name: IniFile, line: number, value: string, previous?: Declaration) {
  if (name === "setup.cfg") {
    // A multi-line python_requires continues the first declaration instead of starting another.
    if (previous) {
      previous.value += `,${value}`;
      return [];
    }
    return [{ path, line, value, kind: "compatibility range" } satisfies Declaration];
  }
  return [...toxPythonVersions(value)].map(
    (version): Declaration => ({ path, line, value: version, kind: "pinned runtime", identity: version }),
  );
}

export function collectIniRuntime(path: string, contents: string, name: IniFile): Declaration[] {
  const declarations: Declaration[] = [];
  let section = "";
  let active = false;
  let optionIndent = 0;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const text = rawLine.replace(/(?:^|\s)[#;].*$/, "").trim();
    if (!text) continue;
    const header = /^\[([^\]]+)\]$/.exec(text);
    if (header) {
      section = required(header[1], "ini section header").toLowerCase();
      active = false;
      continue;
    }
    const indent = rawLine.length - rawLine.trimStart().length;
    let value = text;
    if (!active || indent <= optionIndent) {
      const option = /^([\w-]+)\s*[=:]\s*(.*)$/.exec(text);
      active = isRuntimeOption(name, section, option?.[1]);
      optionIndent = indent;
      value = option?.[2] ?? "";
    }
    if (!active || !value) continue;
    declarations.push(...iniDeclarations(path, name, index + 1, value, declarations[0]));
  }
  return declarations;
}
