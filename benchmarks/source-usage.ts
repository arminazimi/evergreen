import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import { performance } from "node:perf_hooks";

import type { SourceUsageContract } from "../src/domain.js";
import { analyzeSourceUsage } from "../src/source-usage.js";
import { analyzeJavaScriptFile } from "../src/usage/javascript.js";

const fileCount = 200;
const expectedUsages = fileCount * 2;
const contract: SourceUsageContract = {
  id: "request",
  matchers: [
    { kind: "import", language: "typescript", module: "request" },
    {
      kind: "call",
      language: "typescript",
      module: "request",
      targets: ["get"],
    },
  ],
};

const repetitions = 15;

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]!;
}

function summarize(samples: number[]): { medianMs: number; p95Ms: number } {
  const sorted = [...samples].sort((left, right) => left - right);
  return { medianMs: Number(percentile(sorted, 0.5).toFixed(2)), p95Ms: Number(percentile(sorted, 0.95).toFixed(2)) };
}

async function typeScriptFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await typeScriptFiles(path)));
    else if (extname(path) === ".ts") found.push(path);
  }
  return found.sort();
}

/** Scans the repository's own TypeScript sources with both engines: regex as one batch, tree-sitter file by file. */
async function compareEngines(): Promise<Record<string, unknown>> {
  const repositoryRoot = join(import.meta.dirname, "..", "..");
  const corpus = join(repositoryRoot, "src");
  const files = await typeScriptFiles(corpus);
  const sources = await Promise.all(files.map(async (path) => ({ path: relative(corpus, path).split("\\").join("/"), source: await readFile(path, "utf8") })));
  const usageContract: SourceUsageContract = {
    id: "node-modules",
    matchers: [
      { kind: "import", language: "typescript", module: "node:fs/promises" },
      { kind: "call", language: "typescript", module: "node:fs/promises", targets: ["readFile", "writeFile", "mkdir", "readdir", "rm"] },
      { kind: "import", language: "typescript", module: "node:path" },
      { kind: "call", language: "typescript", module: "node:path", targets: ["join", "resolve", "dirname", "relative"] },
    ],
  };
  const regexRun = async (): Promise<number> => {
    const startedAt = performance.now();
    await analyzeSourceUsage(corpus, [usageContract], { parser: false });
    return performance.now() - startedAt;
  };
  const treeSitterRun = async (): Promise<number> => {
    const startedAt = performance.now();
    for (const file of sources) await analyzeJavaScriptFile({ path: file.path, language: "typescript", source: file.source }, [usageContract]);
    return performance.now() - startedAt;
  };
  const treeSitterCold = await treeSitterRun();
  await regexRun();
  const regex: number[] = [];
  const treeSitter: number[] = [];
  for (let run = 0; run < repetitions; run += 1) {
    regex.push(await regexRun());
    treeSitter.push(await treeSitterRun());
  }
  const regexSummary = summarize(regex);
  const treeSitterSummary = summarize(treeSitter);
  return {
    corpus: "src/**/*.ts",
    files: files.length,
    repetitions,
    regex: regexSummary,
    treeSitter: { ...treeSitterSummary, coldFirstRunMs: Number(treeSitterCold.toFixed(2)) },
    medianRatio: Number((treeSitterSummary.medianMs / regexSummary.medianMs).toFixed(2)),
  };
}

const root = await mkdtemp(join(tmpdir(), "evergreen-source-benchmark-"));
try {
  const source = join(root, "src");
  await mkdir(source);
  await Promise.all(
    Array.from({ length: fileCount }, async (_, index) => {
      await writeFile(
        join(source, `client-${index}.ts`),
        `import legacyRequest from "request";\nlegacyRequest.get("https://example.com");\n// legacyRequest.get("ignored");\nconst sample = "request.get()";\n`,
      );
    }),
  );

  const startedAt = performance.now();
  const [analysis] = await analyzeSourceUsage(root, [contract], { parser: false });
  const durationMs = performance.now() - startedAt;
  const usages = analysis?.usages ?? [];
  const detectedUsages = usages.length;
  const expected = new Set(
    Array.from({ length: fileCount }).flatMap((_, index) => [
      `import:src/client-${index}.ts:1`,
      `call:src/client-${index}.ts:2`,
    ]),
  );
  const detected = new Set(
    usages.map((usage) =>
      [usage.kind, usage.location.path, usage.location.line].join(":"),
    ),
  );
  const truePositives = [...detected].filter((usage) => expected.has(usage)).length;
  const precision = detectedUsages === 0 ? 0 : truePositives / detectedUsages;
  const recall = truePositives / expectedUsages;
  const result = {
    files: fileCount,
    expectedUsages,
    detectedUsages,
    precision,
    recall,
    durationMs: Number(durationMs.toFixed(2)),
    engines: await compareEngines(),
  };

  console.log(JSON.stringify(result, null, 2));
  if (precision !== 1 || recall !== 1) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
