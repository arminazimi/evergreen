import type { ImportReference } from "./imports.js";
import { rubyInvocations } from "./ruby-invocations.js";

interface RubyAlias {
  local: string;
  target: string;
}

const RUBY_MAX_ALIASES = 256;
const RUBY_MAX_ALIAS_DEPTH = 8;
const RUBY_MAX_RECEIVER_FORMS = 64;

/**
 * Resolve `name` through constant assignments iteratively. Cycles and chains deeper than
 * {@link RUBY_MAX_ALIAS_DEPTH} resolve to nothing (undefined), never throw.
 */
function resolveRubyAlias(
  name: string,
  assigned: ReadonlyMap<string, string>,
  memo: Map<string, string | undefined>,
): string | undefined {
  if (memo.has(name)) return memo.get(name);

  let current = name;
  let suffix = "";
  const seen = new Set<string>();
  for (let depth = 0; depth < RUBY_MAX_ALIAS_DEPTH; depth += 1) {
    if (seen.has(current)) {
      memo.set(name, undefined);
      return undefined;
    }
    seen.add(current);
    const next = assigned.get(current);
    if (!next) {
      const resolved = `${current}${suffix}`;
      memo.set(name, resolved);
      return resolved;
    }
    const parts = next.split("::");
    if (parts.length > 1) suffix = `::${parts.slice(1).join("::")}${suffix}`;
    current = parts[0] ?? "";
  }
  memo.set(name, undefined);
  return undefined;
}

/** `Parser = JSON` and `parser = ::JSON::Parser`, including an alias of an alias in the same file. */
export function rubyAliases(maskedLines: readonly string[]): RubyAlias[] {
  const assigned = new Map<string, string>();
  const pattern = /^\s*([$@]{0,2}[A-Za-z_]\w*)\s*(?:\|\|)?=\s*(?:::)?([A-Z]\w*(?:::[A-Z]\w*)*)\s*$/;
  for (const line of maskedLines) {
    if (assigned.size >= RUBY_MAX_ALIASES) break;
    const match = pattern.exec(line);
    if (!match?.[1] || !match[2]) continue;
    assigned.set(match[1], match[2]);
  }
  const memo = new Map<string, string | undefined>();
  const aliases: RubyAlias[] = [];
  for (const local of assigned.keys()) {
    const target = resolveRubyAlias(local, assigned, memo);
    if (target === undefined || target === local) continue;
    aliases.push({ local, target });
  }
  return aliases;
}

/** Qualified call forms for a target such as `JSON.parse`, plus receivers assigned from that constant. */
export function rubyReceivers(target: string, aliases: readonly RubyAlias[]): string[][] {
  const parts = target.split(/::|\./).filter((part) => part.length > 0);
  if (parts.length < 2) return [];
  const forms: string[][] = [parts];
  const seen = new Set<string>([parts.join("\0")]);
  for (const alias of aliases) {
    if (forms.length >= RUBY_MAX_RECEIVER_FORMS) break;
    const aliasParts = alias.target.split("::");
    if (aliasParts.length === 0 || aliasParts.length >= parts.length) continue;
    if (!aliasParts.every((part, index) => part === parts[index])) continue;
    const form = [alias.local, ...parts.slice(aliasParts.length)];
    const key = form.join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push(form);
  }
  return forms;
}

/** `require`/`load`/`gem`/`autoload` of a string. `require_relative` is a local file, not a gem. Bindings stay empty; calls use the rule's qualified target. */
export function rubyImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  for (const invocation of rubyInvocations(lines, maskedLines).invocations) {
    if (invocation.argument.kind !== "literal" || invocation.kind === "require_relative") continue;
    const module = invocation.argument.value.replace(/\.rb$/, "");
    if (module.length === 0) continue;
    references.push({ module, line: invocation.line, column: invocation.argument.column, bindings: [] });
  }
  return references;
}
