import type { DraftRule, Importer } from "./types.js";

export const GO_RELEASE_HISTORY_URL = "https://go.dev/doc/devel/release";

interface ReleaseLine {
  minor: number;
  released: string;
}

function releaseLines(html: string): ReleaseLine[] {
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const lines = new Map<number, string>();
  for (const match of text.matchAll(/go1\.(\d+)\.0 \(released (\d{4}-\d{2}-\d{2})\)/g)) {
    lines.set(Number(match[1]), match[2]!);
  }
  return [...lines].map(([minor, released]) => ({ minor, released })).sort((left, right) => left.minor - right.minor);
}

function rule(line: ReleaseLine, deadline: string, supportedMinor: number): DraftRule {
  return {
    id: `go.runtime.end-of-support-1.${line.minor}`,
    ecosystem: "go",
    purl: "pkg:generic/golang",
    vers: `vers:golang/>=1.${line.minor}.0|<1.${line.minor + 1}.0`,
    event: "end-of-support",
    title: `Go 1.${line.minor} is no longer supported`,
    summary: `The Go release policy supports a major release until two newer major releases exist. Go 1.${line.minor} support ended when Go 1.${line.minor + 2} was released.`,
    severity: "high",
    replacement: `Go 1.${supportedMinor} or later`,
    deadline,
    sources: [{ title: "Go release history and support policy", url: GO_RELEASE_HISTORY_URL }],
  };
}

export const goReleasePolicyImporter: Importer = {
  id: "go-1",
  ecosystem: "go",
  description: "Unsupported Go release lines derived from the official two-newer-major support policy",
  sources: [{ title: "Go release history and support policy", url: GO_RELEASE_HISTORY_URL }],

  async import(context) {
    const lines = releaseLines(await context.fetchText(GO_RELEASE_HISTORY_URL, { accept: "text/html" }));
    if (lines.length < 3) return { rules: [], notes: ["No usable Go release history was found."] };
    const byMinor = new Map(lines.map((line) => [line.minor, line]));
    const newest = lines.at(-1)!;
    const supportedMinor = newest.minor - 1;
    const ended = lines
      .filter((line) => line.minor <= newest.minor - 2 && byMinor.has(line.minor + 2))
      .slice(-5)
      .map((line) => rule(line, byMinor.get(line.minor + 2)!.released, supportedMinor));
    return {
      rules: ended,
      notes: [
        `Supported release lines: Go 1.${supportedMinor} and Go 1.${newest.minor}.`,
        `No scheduled rule was drafted: Go announces no end date for Go 1.${supportedMinor} or Go 1.${newest.minor}; each ends when a release two majors newer ships.`,
      ],
    };
  },
};


