/** Comment and trailing-comma stripping for JSONC (the bun.lock dialect). */

const isLineBreak = (char: string | undefined): boolean => char === "\n" || char === "\r";

/** Index just past a `//` comment starting at `i` (the line break itself is not consumed). */
function endOfLineComment(contents: string, start: number): number {
  let i = start + 2;
  while (i < contents.length && !isLineBreak(contents[i])) i++;
  return i;
}

/** Index just past a block comment starting at `i`; an unterminated comment runs to the end. */
function endOfBlockComment(contents: string, start: number): number {
  let i = start + 2;
  while (i < contents.length && !(contents[i] === "*" && contents[i + 1] === "/")) i++;
  return Math.min(i + 2, contents.length);
}

/** Index just past the string literal whose opening quote is at `start`. */
function endOfString(contents: string, start: number): number {
  let i = start + 1;
  while (i < contents.length) {
    const char = contents[i];
    if (char === "\\") i += 2;
    else if (char === '"') return i + 1;
    else i++;
  }
  return contents.length;
}

/** True when the comma at `index` is followed (past whitespace and comments) by `}` or `]`. */
function isTrailingComma(contents: string, index: number): boolean {
  let i = index + 1;
  while (i < contents.length) {
    const char = contents.charAt(i);
    const next = contents[i + 1];
    if (char === " " || char === "\t" || isLineBreak(char)) i++;
    else if (char === "/" && next === "/") i = endOfLineComment(contents, i);
    else if (char === "/" && next === "*") i = endOfBlockComment(contents, i);
    else return char === "}" || char === "]";
  }
  return false;
}

export function stripJsonc(contents: string): string {
  let result = "";
  let i = 0;
  while (i < contents.length) {
    const char = contents.charAt(i);
    const next = contents[i + 1];
    if (char === '"') {
      const end = endOfString(contents, i);
      result += contents.slice(i, end);
      i = end;
    } else if (char === "/" && next === "/") {
      i = endOfLineComment(contents, i);
    } else if (char === "/" && next === "*") {
      const end = endOfBlockComment(contents, i);
      result += [...contents.slice(i, end)].filter(isLineBreak).join("");
      i = end;
    } else {
      result += char === "," && isTrailingComma(contents, i) ? " " : char;
      i++;
    }
  }
  return result;
}
