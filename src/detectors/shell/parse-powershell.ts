/**
 * Bounded, literal-only PowerShell declaration reader. Never evaluates scripts.
 * Reads standalone #Requires -Version directives and top-level PowerShellVersion
 * keys in a root manifest hashtable. Dynamic expressions, nested keys, computed
 * keys, here-string values, and directives with additional options are ignored.
 * Unclosed strings, comments, or delimiters invalidate the whole input. This is
 * a lexical reader, not a PowerShell syntax validator. No module lifecycle
 * claim is inferred from a version declaration.
 */
export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface PowerShellVersionDeclaration {
  kind: "powershell-version";
  value: string;
  line: number;
}

interface Token { text: string; line: number; string?: boolean }
const VERSION = /^\d+\.\d+(?:\.\d+){0,2}$/;

export function parsePowerShell(contents: string): PowerShellVersionDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];
  const source = contents.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  const tokens: Token[] = [];
  const directives: PowerShellVersionDeclaration[] = [];
  const stack: string[] = [];
  let line = 1;
  let continuedLine = 0;
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (source.startsWith("<#", i)) {
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (source.startsWith("<#", i)) { depth++; i += 2; }
        else if (source.startsWith("#>", i)) { depth--; i += 2; }
        else { if (source[i] === "\n") line++; i++; }
      }
      if (depth) return [];
      continue;
    }
    if (c === "#") {
      const end = source.indexOf("\n", i);
      const text = source.slice(i, end < 0 ? source.length : end);
      const whole = lines[line - 1]!;
      const match = /^\s*#requires\s+-version\s+(\d+\.\d+(?:\.\d+){0,2})\s*$/i.exec(whole);
      if (line !== continuedLine && whole.length <= MAXIMUM_LINE_LENGTH && match && whole.trimStart() === text) {
        directives.push({ kind: "powershell-version", value: match[1]!, line });
      }
      i = end < 0 ? source.length : end;
      continue;
    }
    if (c === "@" && (source[i + 1] === "'" || source[i + 1] === '"') && source[i + 2] === "\n") {
      const close = source[i + 1]! + "@";
      const startLine = line;
      i += 3; line++;
      let closed = false;
      while (i < source.length) {
        if (source.startsWith(close, i) && source[i - 1] === "\n") { i += 2; closed = true; break; }
        if (source[i] === "\n") line++;
        i++;
      }
      if (!closed) return [];
      tokens.push({ text: "<here-string>", line: startLine });
      continue;
    }
    if (c === "'" || c === '"') {
      const startLine = line;
      let text = "";
      let literal = true;
      let closed = false;
      i++;
      while (i < source.length) {
        const next = source[i]!;
        if (next === c) {
          if (source[i + 1] === c) { text += c; i += 2; continue; }
          i++; closed = true; break;
        }
        if (c === '"' && next === "`") {
          literal = false;
          if (source[i + 1] === "\n") line++;
          i += 2; continue;
        }
        if (c === '"' && next === "$") literal = false;
        if (next === "\n") line++;
        text += next; i++;
      }
      if (!closed) return [];
      tokens.push({ text: literal ? text : "<dynamic>", line: startLine, string: true });
      continue;
    }
    if (c === "`") {
      // A continued line can turn the following # into part of a command, so a
      // comment that starts the continued line is never read as a directive.
      if (source[i + 1] === "\n") { line++; continuedLine = line; i += 2; continue; }
      tokens.push({ text: "<escaped>", line }); i += 2; continue;
    }
    if ("([{".includes(c)) stack.push(c);
    if (")]}".includes(c)) {
      if (stack.pop() !== ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[c]) return [];
    }
    const word = /^[\w.$-]+/.exec(source.slice(i));
    if (word) { tokens.push({ text: word[0], line }); i += word[0].length; }
    else { tokens.push({ text: c, line }); i++; }
  }
  if (stack.length) return [];
  const results = [...directives];
  // A manifest must be a root hashtable, not a script assigning an unrelated value.
  if (tokens[0]?.text !== "@" || tokens[1]?.text !== "{" || tokens.at(-1)?.text !== "}") return results;
  let depth = 0;
  for (let n = 1; n < tokens.length; n++) {
    const token = tokens[n]!;
    if (!token.string && "([{".includes(token.text)) depth++;
    if (!token.string && ")]}".includes(token.text)) depth--;
    if (depth === 0 && n !== tokens.length - 1) return directives;
    if (depth !== 1 || token.text.toLowerCase() !== "powershellversion") continue;
    const previous = tokens[n - 1]!;
    if (previous.line === token.line && previous.text !== "{" && previous.text !== ";") continue;
    const value = tokens[n + 2];
    const after = tokens[n + 3];
    if (tokens[n + 1]?.text !== "=" || !value?.string || !VERSION.test(value.text)) continue;
    if (after && after.line === value.line && after.text !== ";" && after.text !== "}") continue;
    if (lines[value.line - 1]!.length > MAXIMUM_LINE_LENGTH) continue;
    results.push({ kind: "powershell-version", value: value.text, line: value.line });
  }
  return results.sort((a, b) => a.line - b.line);
}
