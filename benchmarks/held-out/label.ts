// Maintainer-only network tool: writes the ground truth of the held-out set (decision 0013, issue #740).
//
//   npm run build --silent && node dist/benchmarks/held-out/label.js
//
// It reads only the pinned repositories' workflow files and `.nvmrc` through the GitHub API and applies three
// plain-text rules. It never imports a detector and never reads the registry, so the labels do not depend on
// Evergreen's output, and the file it writes is committed before Evergreen scans these repositories.
//
//   github-actions.checkout / .setup-node / .cache  `uses: actions/<name>@<ref>` with major version 4 or lower
//                                                   (the major comes from the ref, or from a `# vN` comment after a SHA)
//   nodejs.runtime                                  a workflow `node-version:` line, or `.nvmrc`, naming a Node.js
//                                                   major of 20 or lower (the lines past end of life on the labelling date)

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const FILE = resolve("benchmarks/held-out-repositories.json");
const ACTIONS = ["checkout", "setup-node", "cache"];

export interface HeldOutExpected { family: string; path: string; line: number }

/** The ground truth in one file's text; `path` is relative to the repository root. */
export function labelFile(path: string, text: string): HeldOutExpected[] {
  const found: HeldOutExpected[] = [];
  const lines = text.split("\n");
  if (path === ".nvmrc") {
    const major = /^\s*v?(\d+)/.exec(lines[0] ?? "")?.[1];
    if (major !== undefined && Number(major) <= 20) found.push({ family: "nodejs.runtime", path, line: 1 });
    return found;
  }
  lines.forEach((line, index) => {
    const code = line.replace(/\s+#.*$/, "");
    const uses = /^\s*-?\s*uses:\s*['"]?actions\/([a-z-]+)@([^\s'"]+)/.exec(line);
    if (uses && ACTIONS.includes(uses[1]!)) {
      const ref = uses[2]!;
      const major = /^[0-9a-f]{40}$/.test(ref) ? /#\s*v?(\d+)/.exec(line)?.[1] : /^v?(\d+)(?:[.\d]*)$/.exec(ref)?.[1];
      if (major !== undefined && Number(major) <= 4) found.push({ family: `github-actions.${uses[1]}`, path, line: index + 1 });
    }
    const node = /^\s*-?\s*node-version:\s*(.+)$/.exec(code);
    if (node) {
      const majors = [...node[1]!.matchAll(/(?<![\d.])v?(\d{1,2})(?![\d])/g)].map((match) => Number(match[1]));
      if (majors.some((major) => major <= 20)) found.push({ family: "nodejs.runtime", path, line: index + 1 });
    }
  });
  return found;
}

async function api(path: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await run("gh", ["api", path, "-H", "Accept: application/vnd.github.raw+json"], { maxBuffer: 16 * 1024 * 1024 })).stdout;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((done) => setTimeout(done, 2000 * attempt));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = JSON.parse(await readFile(FILE, "utf8")) as { repositories: Array<{ repository: string; commit: string; expected: HeldOutExpected[] }> };
  for (const entry of file.repositories) {
    const tree = JSON.parse(await api(`repos/${entry.repository}/git/trees/${entry.commit}?recursive=1`)) as { tree: Array<{ path: string; type: string }> };
    const paths = tree.tree.filter((item) => item.type === "blob" && (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(item.path) || item.path === ".nvmrc")).map((item) => item.path);
    entry.expected = [];
    for (const path of paths) entry.expected.push(...labelFile(path, await api(`repos/${entry.repository}/contents/${path}?ref=${entry.commit}`)));
    console.error(`${entry.repository}: ${entry.expected.length}`);
  }
  await writeFile(FILE, `${JSON.stringify(file, null, 2)}\n`);
}
