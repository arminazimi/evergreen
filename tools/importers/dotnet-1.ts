import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const DOTNET_RELEASES_INDEX_URL = "https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json";

const SOURCES = [
  { title: ".NET and .NET Core official support policy", url: "https://dotnet.microsoft.com/platform/support/policy/dotnet-core" },
  { title: ".NET releases index (channel, support phase, end-of-life date)", url: DOTNET_RELEASES_INDEX_URL },
];

interface Channel {
  "channel-version"?: unknown;
  "release-type"?: unknown;
  "support-phase"?: unknown;
  "eol-date"?: unknown;
}

interface Line {
  major: number;
  minor: number;
  type: "lts" | "sts";
  phase: string;
  eol: string | undefined;
}

function lines(index: { "releases-index"?: unknown }): Line[] {
  const found: Line[] = [];
  const channels = Array.isArray(index["releases-index"]) ? (index["releases-index"] as Channel[]) : [];
  for (const channel of channels) {
    const match = typeof channel["channel-version"] === "string" ? /^(\d+)\.(\d+)$/.exec(channel["channel-version"]) : null;
    const type = channel["release-type"];
    if (!match || (type !== "lts" && type !== "sts") || typeof channel["support-phase"] !== "string") continue;
    const eol = isIsoDate(channel["eol-date"]) ? channel["eol-date"] : undefined;
    found.push({ major: Number(match[1]), minor: Number(match[2]), type, phase: channel["support-phase"], eol });
  }
  return found;
}

const name = (line: Line): string => `${line.major >= 5 ? ".NET" : ".NET Core"} ${line.major}.${line.minor}`;
const shortName = (line: Line): string => (line.minor === 0 ? `${name(line).replace(/\.0$/, "")}` : name(line));

export const dotnetReleasesImporter: Importer = {
  id: "dotnet-1",
  ecosystem: "dotnet",
  description: "The .NET release lines whose end of support has passed, from the official releases index",
  sources: SOURCES,

  async import(context) {
    const today = isoDate(context.now);
    const notes: string[] = [];
    const all = lines(await fetchJson<{ "releases-index"?: unknown }>(context, DOTNET_RELEASES_INDEX_URL));
    if (all.length === 0) {
      notes.push("No usable release channels were found, so nothing was drafted.");
      return { rules: [], notes };
    }

    // An announced end within a year becomes a scheduled rule (decision 0010); a later one is only noted.
    const horizon = isoDate(new Date(Date.UTC(context.now.getUTCFullYear() + 1, context.now.getUTCMonth(), context.now.getUTCDate())));
    const undated = all.filter((line) => line.eol === undefined && line.phase === "eol");
    for (const line of undated) notes.push(`${shortName(line)} is marked end of life but has no end-of-life date, so no rule was drafted.`);
    for (const line of all.filter((candidate) => candidate.eol !== undefined && candidate.eol > horizon)) notes.push(`${shortName(line)} ends support on ${line.eol}, which is more than twelve months after ${today}, so no rule was drafted.`);

    const current = all
      .filter((line) => line.type === "lts" && line.phase !== "eol" && (line.eol === undefined || line.eol > today))
      .sort((left, right) => right.major - left.major || right.minor - left.minor)[0];
    const replacement = current ? `.NET ${current.major} (LTS), or the newest supported .NET release` : "The newest supported .NET release";

    const rules: DraftRule[] = all
      .filter((line): line is Line & { eol: string } => line.eol !== undefined && line.eol <= horizon)
      .sort((left, right) => right.major - left.major || right.minor - left.minor)
      .map((line) => {
        const label = shortName(line);
        const term = line.type === "lts" ? "Long Term Support" : "Standard Term Support";
        const scheduled = line.eol > today;
        return {
          id: `dotnet.runtime.end-of-support-${line.major}.${line.minor}`,
          ecosystem: "dotnet",
          purl: "pkg:generic/dotnet",
          vers: `vers:semver/>=${line.major}.${line.minor}.0|<${line.major}.${line.minor + 1}.0`,
          event: scheduled ? "scheduled-end-of-life" : "end-of-support",
          title: scheduled ? `${label} reaches end of support on ${line.eol}` : `${label} is no longer supported`,
          summary: scheduled
            ? `${label} (${term}) is scheduled to reach the end of its support on ${line.eol}, according to Microsoft's releases index. After that date Microsoft no longer ships security or quality fixes for it. The same line applies to the SDK that carries it, so a global.json pinning an SDK ${line.major}.${line.minor}.x is reported too.`
            : `${label} (${term}) reached the end of its support on ${line.eol}. Microsoft no longer ships security or quality fixes for it. The same line applies to the SDK that carries it, so a global.json pinning an SDK ${line.major}.${line.minor}.x is reported too.`,
          severity: scheduled ? "low" : "high",
          replacement,
          deadline: line.eol,
          sources: SOURCES,
        };
      });
    const scheduledCount = rules.filter((rule) => rule.event === "scheduled-end-of-life").length;
    notes.unshift(`Drafted ${rules.length} rule${rules.length === 1 ? "" : "s"} on ${today}: ${rules.length - scheduledCount} past end of support, ${scheduledCount} scheduled.`);
    return { rules, notes };
  },
};
