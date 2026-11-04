import type { SourceLanguage } from "../domain.js";

/** The separator between a package and its submodules, for languages whose imports are hierarchical. */
const MODULE_SEPARATORS: Partial<Record<SourceLanguage, string>> = {
  python: ".",
  go: "/",
  java: ".",
  kotlin: ".",
  rust: "::",
  csharp: ".",
  swift: ".",
};

/** True when `actual` names `expected` or one of its submodules in `language`. */
export function moduleMatches(actual: string, expected: string, language: SourceLanguage): boolean {
  if (language === "ruby") {
    const actualName = actual.replace(/\.rb$/, "");
    const expectedName = expected.replace(/\.rb$/, "");
    return actualName === expectedName || actualName.startsWith(`${expectedName}/`);
  }
  if (language === "php") {
    const normalize = (value: string): string => value.replace(/^\\+/, "").replace(/\.php$/, "");
    const actualName = normalize(actual);
    const expectedName = normalize(expected);
    return (
      actualName === expectedName ||
      actualName.startsWith(`${expectedName}\\`) ||
      actualName.startsWith(`${expectedName}/`)
    );
  }
  const separator = MODULE_SEPARATORS[language];
  if (separator === undefined) return actual === expected;
  return actual === expected || actual.startsWith(`${expected}${separator}`);
}
