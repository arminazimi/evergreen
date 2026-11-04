import type { ConfigUsageMatcher } from "../domain.js";
import { escapePattern } from "./patterns.js";

export function configKeyMatch(line: string, matcher: ConfigUsageMatcher): number | undefined {
  const key = escapePattern(matcher.key);
  const pattern =
    matcher.language === "json"
      ? new RegExp(`["']${key}["']\\s*:`)
      : matcher.language === "yaml"
        ? new RegExp(`^\\s*${key}\\s*:`)
        : new RegExp(`^\\s*${key}\\s*=`);
  const match = pattern.exec(line);
  if (!match || (matcher.valueIncludes && !line.includes(matcher.valueIncludes))) return undefined;
  const keyIndex = line.indexOf(matcher.key, match.index);
  return keyIndex === -1 ? match.index + 1 : keyIndex + 1;
}
