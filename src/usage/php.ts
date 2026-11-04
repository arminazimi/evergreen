import { escapePattern } from "./patterns.js";

export const PHP_MAX_LINE = 4096;
export const PHP_MAX_REFERENCE = 200;
const PHP_MAX_ALIASES = 256;
const PHP_MAX_ALIAS_DEPTH = 8;
const PHP_MAX_RECEIVER_FORMS = 64;
export const PHP_DYNAMIC_ARGUMENT_REASON =
  "the argument is not a string literal, so Evergreen does not attribute it to a package";
const PHP_DYNAMIC_NAME_REASON =
  "the class or function name is a variable, so Evergreen does not attribute it to a package";

interface PhpAlias {
  local: string;
  target: string;
}

interface PhpUseHit {
  module: string;
  line: number;
  column: number;
}

function phpNormalizeName(value: string): string {
  return value.replace(/^\\+/, "");
}

function phpLastSegment(name: string): string {
  const normalized = phpNormalizeName(name);
  const slash = normalized.lastIndexOf("\\");
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}

function readPhpName(line: string, cursor: number): { raw: string; column: number; end: number } | undefined {
  const match = /^\\?[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*/.exec(line.slice(cursor));
  if (!match?.[0]) return undefined;
  const raw = match[0];
  const offset = raw.startsWith("\\") ? 1 : 0;
  return { raw, column: cursor + offset + 1, end: cursor + raw.length };
}

function phpWordAt(line: string, cursor: number, word: string): boolean {
  if (!line.startsWith(word, cursor)) return false;
  const after = line[cursor + word.length];
  return after === undefined || !/[\w$]/.test(after);
}

/** One-level `use Prefix\{A, B as C}`. Nested groups are left unread. */
function readPhpGroup(
  line: string,
  prefix: string,
  brace: number,
):
  | { imports: Array<{ module: string; column: number }>; aliases: Array<{ local: string; target: string }> }
  | undefined {
  const imports: Array<{ module: string; column: number }> = [];
  const aliases: Array<{ local: string; target: string }> = [];
  let cursor = brace + 1;
  while (cursor < line.length) {
    while (line[cursor] === " " || line[cursor] === "\t" || line[cursor] === ",") cursor += 1;
    if (line[cursor] === "}") return imports.length > 0 ? { imports, aliases } : undefined;
    const name = readPhpName(line, cursor);
    if (!name || name.raw.includes("\\")) return undefined;
    cursor = name.end;
    while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    let local = name.raw;
    if (phpWordAt(line, cursor, "as")) {
      cursor += 2;
      while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      const alias = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(cursor));
      if (!alias) return undefined;
      local = alias[0];
      cursor += alias[0].length;
    }
    const module = `${prefix}\\${name.raw}`;
    imports.push({ module, column: name.column });
    aliases.push({ local, target: module });
  }
  return undefined;
}

/** One `use` statement at `start`, or undefined for a closure `use (` or a form this scanner does not understand. */
function readPhpUse(
  line: string,
  start: number,
):
  | { imports: Array<{ module: string; column: number }>; aliases: Array<{ local: string; target: string }> }
  | undefined {
  let cursor = start + "use".length;
  const skipSpace = (): void => {
    while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  };
  skipSpace();
  if (line[cursor] === "(") return undefined;
  if (phpWordAt(line, cursor, "function")) {
    cursor += "function".length;
    skipSpace();
  } else if (phpWordAt(line, cursor, "const")) {
    cursor += "const".length;
    skipSpace();
  }
  const name = readPhpName(line, cursor);
  if (!name) return undefined;
  cursor = name.end;
  skipSpace();
  if (line[cursor] === "\\") {
    let look = cursor + 1;
    while (line[look] === " " || line[look] === "\t") look += 1;
    if (line[look] === "{") cursor = look;
  }
  if (line[cursor] === "{") return readPhpGroup(line, phpNormalizeName(name.raw), cursor);
  let local = phpLastSegment(name.raw);
  if (phpWordAt(line, cursor, "as")) {
    cursor += 2;
    skipSpace();
    const alias = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(cursor));
    if (!alias?.[0]) return undefined;
    local = alias[0];
  }
  const module = phpNormalizeName(name.raw);
  if (module.length === 0 || local.length === 0) return undefined;
  return { imports: [{ module, column: name.column }], aliases: [{ local, target: module }] };
}

interface PhpUseScan {
  imports: PhpUseHit[];
  aliases: PhpAlias[];
}

/**
 * Resolve `name` through `use` aliases. A later alias of an alias follows the chain. Cycles and chains
 * deeper than {@link PHP_MAX_ALIAS_DEPTH} resolve to nothing.
 */
function resolvePhpAlias(
  name: string,
  assigned: ReadonlyMap<string, string>,
  memo: Map<string, string | undefined>,
): string | undefined {
  if (memo.has(name)) return memo.get(name);
  let current = name;
  const seen = new Set<string>();
  for (let depth = 0; depth < PHP_MAX_ALIAS_DEPTH; depth += 1) {
    if (seen.has(current)) {
      memo.set(name, undefined);
      return undefined;
    }
    seen.add(current);
    const exact = assigned.get(current);
    if (exact) {
      current = exact;
      continue;
    }
    const slash = current.indexOf("\\");
    if (slash === -1) {
      memo.set(name, current);
      return current;
    }
    const head = current.slice(0, slash);
    const headTarget = assigned.get(head);
    if (!headTarget) {
      memo.set(name, current);
      return current;
    }
    current = `${headTarget}${current.slice(slash)}`;
  }
  memo.set(name, undefined);
  return undefined;
}

/** `use` imports and the aliases they create, including `use function`, `use const`, and one-level groups. */
export function phpUses(lines: readonly string[], maskedLines: readonly string[]): PhpUseScan {
  const keyword = /(?<![\w$>-])use\b/g;
  const assigned = new Map<string, string>();
  const imports: PhpUseHit[] = [];
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index] ?? "";
    if (line.length > PHP_MAX_LINE || masked.length > PHP_MAX_LINE) continue;
    keyword.lastIndex = 0;
    for (const match of masked.matchAll(keyword)) {
      if (match.index === undefined || assigned.size >= PHP_MAX_ALIASES) continue;
      const parsed = readPhpUse(line, match.index);
      if (!parsed) continue;
      for (const hit of parsed.imports) imports.push({ module: hit.module, line: index + 1, column: hit.column });
      for (const alias of parsed.aliases) {
        if (assigned.size >= PHP_MAX_ALIASES) break;
        assigned.set(alias.local, alias.target);
      }
    }
  }
  const memo = new Map<string, string | undefined>();
  const aliases: PhpAlias[] = [];
  for (const local of assigned.keys()) {
    const target = resolvePhpAlias(local, assigned, memo);
    if (target === undefined || target === local) continue;
    aliases.push({ local, target });
  }
  return { imports, aliases };
}

interface PhpCallForm {
  kind: "new" | "static";
  receiver: string;
  method?: string;
}

const PHP_CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * Call forms for a target. `Swift_Mailer::newInstance` is a static call; `new Swift_Mailer` is a constructor.
 * A `use` alias of that class, or of a namespace prefix, is another receiver. An alias of an alias is already resolved.
 */
export function phpCallForms(target: string, aliases: readonly PhpAlias[]): PhpCallForm[] {
  let kind: PhpCallForm["kind"];
  let className: string;
  let method: string | undefined;
  if (target.startsWith("new ")) {
    kind = "new";
    className = phpNormalizeName(target.slice("new ".length).trim());
    if (!PHP_CLASS_NAME.test(className)) return [];
  } else {
    const split = target.lastIndexOf("::");
    if (split <= 0) return [];
    kind = "static";
    className = phpNormalizeName(target.slice(0, split));
    method = target.slice(split + 2);
    if (!PHP_CLASS_NAME.test(className) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(method)) return [];
  }
  const formFor = (receiver: string): PhpCallForm =>
    method === undefined ? { kind, receiver } : { kind, receiver, method };
  const forms: PhpCallForm[] = [formFor(className)];
  const seen = new Set<string>([`${kind}\0${className}\0${method ?? ""}`]);
  for (const alias of aliases) {
    if (forms.length >= PHP_MAX_RECEIVER_FORMS) break;
    let receiver: string | undefined;
    if (alias.target === className) receiver = alias.local;
    else if (className.startsWith(`${alias.target}\\`))
      receiver = `${alias.local}${className.slice(alias.target.length)}`;
    if (!receiver || !PHP_CLASS_NAME.test(receiver)) continue;
    const key = `${kind}\0${receiver}\0${method ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push(formFor(receiver));
  }
  return forms;
}

export function phpCallPattern(forms: readonly PhpCallForm[]): RegExp {
  const ordered = [...forms].sort((left, right) => right.receiver.length - left.receiver.length);
  const parts = ordered.map((form) => {
    const receiver = form.receiver
      .split("\\")
      .map((segment) => escapePattern(segment))
      .join("\\\\");
    if (form.kind === "new") return `new\\s+\\\\?${receiver}(?![\\w\\\\:])`;
    return `\\\\?${receiver}\\s*::\\s*${escapePattern(form.method ?? "")}\\s*\\(`;
  });
  return new RegExp(`(?<![\\w$\\\\])(?:${parts.join("|")})`, "g");
}

interface PhpDynamicHit {
  line: number;
  column: number;
  reference: string;
  reason: string;
}

/** `new $class` and `$class::method()`. A static `use` or a quoted require is not dynamic. */
export function phpVariableCalls(lines: readonly string[], maskedLines: readonly string[]): PhpDynamicHit[] {
  const variableNew = /(?<![\w$\\])new\s+\$[A-Za-z_][A-Za-z0-9_]*/g;
  const variableStatic = /(?<![\w$\\])\$[A-Za-z_][A-Za-z0-9_]*\s*::\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/g;
  const found: PhpDynamicHit[] = [];
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index] ?? "";
    if (line.length > PHP_MAX_LINE || masked.length > PHP_MAX_LINE) {
      if (/new\s+\$|\$[A-Za-z_][A-Za-z0-9_]*\s*::/.test(masked)) {
        found.push({
          line: index + 1,
          column: 1,
          reference: line.slice(0, PHP_MAX_REFERENCE).trim(),
          reason: `line longer than ${PHP_MAX_LINE} characters`,
        });
      }
      continue;
    }
    for (const pattern of [variableNew, variableStatic]) {
      pattern.lastIndex = 0;
      for (const match of masked.matchAll(pattern)) {
        if (match.index === undefined) continue;
        found.push({
          line: index + 1,
          column: match.index + 1,
          reference: line.slice(match.index, match.index + match[0].length).trim(),
          reason: PHP_DYNAMIC_NAME_REASON,
        });
      }
    }
  }
  return found;
}
