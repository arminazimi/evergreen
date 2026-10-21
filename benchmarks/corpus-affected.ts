import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Every ecosystem a corpus entry can name. A change to shared code maps to all of them. */
export const CORPUS_ECOSYSTEMS = [
  "android",
  "ci-images",
  "container",
  "cpp",
  "dart",
  "dotnet",
  "go",
  "java",
  "kubernetes",
  "node",
  "node-actions",
  "php",
  "python",
  "ruby",
  "rust",
  "serverless",
  "swift",
] as const;

/**
 * Corpus ecosystems for each detector, by the name of its directory or file under `src/detectors/`
 * (the detector id). A detector with no corpus ecosystem maps to `[]` on purpose, so adding a detector
 * without deciding is caught by the test.
 */
export const DETECTOR_ECOSYSTEMS: Readonly<Record<string, readonly string[]>> = {
  android: ["android"],
  "ci-images": ["ci-images"],
  container: ["container"],
  cpp: ["cpp"],
  dart: ["dart"],
  dotnet: ["dotnet"],
  "github-actions": ["node-actions"],
  go: ["go"],
  java: ["java"],
  kubernetes: ["kubernetes"],
  npm: ["node"],
  php: ["php"],
  python: ["python"],
  ruby: ["ruby"],
  rust: ["rust"],
  serverless: ["serverless"],
  swift: ["swift"],
  terraform: [],
};

/**
 * Corpus ecosystems for each file in `registry/`. The Node.js runtime and npm package rules both belong to `node`.
 */
export const REGISTRY_ECOSYSTEMS: Readonly<Record<string, readonly string[]>> = {
  "android.json": ["android"],
  "ci-images.json": ["ci-images"],
  "container.json": ["container"],
  "cpp.json": ["cpp"],
  "dart.json": ["dart"],
  "dotnet.json": ["dotnet"],
  "github-actions-shas.json": ["node-actions"],
  "github-actions.json": ["node-actions"],
  "go.json": ["go"],
  "java.json": ["java"],
  "kubernetes.json": ["kubernetes"],
  "nodejs.json": ["node"],
  "npm.json": ["node"],
  "php.json": ["php"],
  "python.json": ["python"],
  "ruby.json": ["ruby"],
  "rust.json": ["rust"],
  "serverless.json": ["serverless"],
  "sources.lock.json": [],
  "swift.json": ["swift"],
};

/** Corpus ecosystems for each directory in `tests/fixtures/`; directories absent here belong to no corpus ecosystem. */
export const FIXTURE_ECOSYSTEMS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(
    Object.entries(DETECTOR_ECOSYSTEMS).filter(([name]) =>
      ["android", "ci-images", "container", "cpp", "dart", "dotnet", "go", "java", "kubernetes", "php", "ruby", "rust", "serverless", "swift"].includes(name),
    ),
  ),
};

/**
 * Shared files and the ecosystems whose detectors use them. A test checks each list against the real imports
 * under `src/detectors/`, so a detector that starts using a shared file must be added here.
 */
export const SHARED_FILE_ECOSYSTEMS: ReadonlyArray<{ pattern: RegExp; ecosystems: readonly string[]; reason: string }> = [
  {
    pattern: /^src\/source-usage\.ts$|^src\/usage\//,
    ecosystems: ["android", "dart", "dotnet", "go", "java", "node", "php", "python", "ruby", "rust", "swift"],
    reason: "source usage mapping",
  },
  { pattern: /^src\/workspaces\.ts$/, ecosystems: ["node", "python"], reason: "workspace discovery" },
  { pattern: /^src\/purl\.ts$/, ecosystems: ["android", "cpp", "dart", "java", "swift"], reason: "package URLs" },
  { pattern: /^src\/vers\.ts$/, ecosystems: ["container", "kubernetes"], reason: "version ranges" },
  {
    pattern: /^src\/vers\//,
    ecosystems: ["android", "ci-images", "container", "cpp", "dart", "dotnet", "go", "java", "kubernetes", "node", "node-actions", "php", "python", "ruby", "rust", "serverless", "swift"],
    reason: "version ranges",
  },
  { pattern: /^src\/detectors\/json-lines\.ts$/, ecosystems: ["cpp", "dart", "dotnet", "php", "swift"], reason: "JSON line locations" },
  {
    pattern: /^src\/(engine|domain|sdk|paths|registry|data-source|package-files|version|index)\.ts$|^src\/detectors\/index\.ts$|^src\/conformance\/|^benchmarks\/(corpus-harness|public-repositories)\.ts$|^benchmarks\/thresholds\.(ts|json)$/,
    ecosystems: CORPUS_ECOSYSTEMS,
    reason: "shared scan code or corpus scoring",
  },
];

export interface AffectedEcosystem {
  ecosystem: string;
  /** Changed paths that put this ecosystem in the run, with the reason each one does. */
  because: Array<{ path: string; reason: string }>;
}

function ecosystemsFor(path: string): { ecosystems: readonly string[]; reason: string } | undefined {
  const detector = /^src\/detectors\/([^/]+?)(?:\.ts|\/)/.exec(path)?.[1];
  if (detector && detector !== "index" && detector !== "json-lines") {
    return { ecosystems: DETECTOR_ECOSYSTEMS[detector] ?? [], reason: `detector ${detector}` };
  }
  const registry = /^registry\/([^/]+)$/.exec(path)?.[1];
  if (registry) return { ecosystems: REGISTRY_ECOSYSTEMS[registry] ?? [], reason: `registry ${registry}` };
  const fixture = /^tests\/fixtures\/([^/]+)\//.exec(path)?.[1];
  if (fixture) return { ecosystems: FIXTURE_ECOSYSTEMS[fixture] ?? [], reason: `fixtures ${fixture}` };
  for (const shared of SHARED_FILE_ECOSYSTEMS) {
    if (shared.pattern.test(path)) return { ecosystems: shared.ecosystems, reason: shared.reason };
  }
  return undefined;
}

/** The corpus ecosystems a set of changed paths affects, sorted, each with the paths and reasons behind it. */
export function affectedEcosystems(paths: readonly string[]): AffectedEcosystem[] {
  const affected = new Map<string, AffectedEcosystem>();
  for (const path of [...new Set(paths)].sort()) {
    const match = ecosystemsFor(path);
    if (!match) continue;
    for (const ecosystem of match.ecosystems) {
      const entry = affected.get(ecosystem) ?? { ecosystem, because: [] };
      entry.because.push({ path, reason: match.reason });
      affected.set(ecosystem, entry);
    }
  }
  return [...affected.values()].sort((left, right) => left.ecosystem.localeCompare(right.ecosystem));
}

/** Lines saying which ecosystems were chosen and why (at most three paths each). */
export function describeAffected(affected: readonly AffectedEcosystem[], changedCount: number): string[] {
  if (affected.length === 0) return [`No corpus ecosystem is affected by the ${changedCount} changed files; nothing to run.`];
  return affected.map((entry) => {
    const shown = entry.because.slice(0, 3).map((item) => `${item.path} (${item.reason})`).join(", ");
    const more = entry.because.length > 3 ? `, and ${entry.because.length - 3} more` : "";
    return `changed: ${entry.ecosystem} <- ${shown}${more}`;
  });
}

/** `--changed` or `--changed <base>`; the base defaults to `origin/main`. */
export function parseChangedFlag(argv: readonly string[] = process.argv): { base: string } | undefined {
  const index = argv.indexOf("--changed");
  if (index < 0) return undefined;
  const next = argv[index + 1];
  return { base: next !== undefined && !next.startsWith("--") ? next : "origin/main" };
}

/** Paths changed since `base` (committed), plus uncommitted and untracked ones, as POSIX paths from the repository root. */
export async function changedPaths(base: string, cwd: string = process.cwd()): Promise<string[]> {
  const git = async (args: string[]) => (await run("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 })).stdout.split("\n").filter(Boolean);
  const [committed, uncommitted, untracked] = await Promise.all([
    git(["diff", "--name-only", `${base}...HEAD`]),
    git(["diff", "--name-only", "HEAD"]),
    git(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...new Set([...committed, ...uncommitted, ...untracked])].sort();
}
