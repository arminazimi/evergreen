import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  ALLOWLIST_SCHEMA,
  MAX_EXPIRY,
  TARGETS,
  allowlistDebtFindings,
  compareAllowlists,
  compareTargets,
  countLines,
  evaluateQuality,
  isHandWritten,
  measureFile,
  median,
  parseArguments,
  parseAllowlist,
  parseAudit,
  parseTargets,
  readRepository,
  renderFindings,
  renderReport,
  type Allowlist,
  type FileMeasure,
  type QualityInput,
} from "../tools/check-quality.js";

const ROOT = resolve(import.meta.dirname, "../..");
const TODAY = "2026-11-02";

const EMPTY: Allowlist = {
  schemaVersion: ALLOWLIST_SCHEMA,
  fileSize: [],
  functionLength: [],
  complexity: [],
  asUnknownAs: [],
  nonNull: [],
  boundaries: [],
  audit: [],
};

const DEBT = { owner: "#2041", expires: MAX_EXPIRY, reason: "Measured for a test." };

function input(overrides: Partial<QualityInput> & { files?: FileMeasure[] } = {}): QualityInput {
  return {
    files: [],
    allowlist: EMPTY,
    allowlistProblems: [],
    today: TODAY,
    ...overrides,
  };
}

function fileWith(path: string, text: string): FileMeasure {
  return measureFile(path, text);
}

/** Small companions keep the median under the target, so a test isolates the one file it is about. */
function withFillers(...files: FileMeasure[]): FileMeasure[] {
  return [
    ...files,
    fileWith("src/filler-a.ts", "export {};\n"),
    fileWith("src/filler-b.ts", "export {};\n"),
    fileWith("src/filler-c.ts", "export {};\n"),
  ];
}

test("cyclomatic complexity counts decision points and ignores nested functions", () => {
  const measured = measureFile(
    "src/x.ts",
    `export function decide(a: number, b: number | null) {
  if (a > 0 && b !== null) {
    return b ?? 0;
  }
  for (const x of [a]) {
    if (x || a) return x;
  }
  const nested = () => {
    if (a) return 1;
    return 2;
  };
  return a > 1 ? nested() : 0;
}
`,
  );
  const [only] = measured.functions;
  assert.equal(measured.functions.length, 2);
  assert.equal(only?.name, "decide");
  // 1 + if + && + ?? + for-of + if + || + ?: = 8; the nested arrow's `if` is counted on its own.
  assert.equal(only?.complexity, 8);
  assert.deepEqual(measured.functions[1], { name: "decide > nested", complexity: 2, lines: 4 });
});

test("methods are named by class and duplicate names are numbered in source order", () => {
  const measured = measureFile(
    "src/x.ts",
    `class Store {
  get(key: string) { return key ? 1 : 0; }
  set(key: string) { return key ? 1 : 0; }
}
function same() { return 1; }
function same2() { return 1; }
export function dup() { return 1; }
const handler = () => 1;
export const other = () => 2;
`,
  );
  assert.deepEqual(
    measured.functions.map((fn) => fn.name),
    ["Store.get", "Store.set", "same", "same2", "dup", "handler", "other"],
  );
  const twice = measureFile("src/y.ts", "function a() {}\nfunction a() {}\nfunction a() {}\n");
  assert.deepEqual(
    twice.functions.map((fn) => fn.name),
    ["a", "a#2", "a#3"],
  );
});

test("the complexity walk does not count a nested class method against its enclosing function", () => {
  const source = measureFile(
    "src/x.ts",
    "function outer(a: number) {\n  class Inner { m(b: number) { return b ? 1 : 0; } }\n  return a ? new Inner() : null;\n}\n",
  );
  const outer = source.functions.find((fn) => fn.name === "outer");
  assert.equal(outer?.complexity, 2);
});

test("a function's line span runs from its first line through its closing brace", () => {
  const measured = measureFile(
    "src/x.ts",
    `const tiny = () => 1;
export function eight(
  a: number,
) {
  if (a) {
    return a;
  }
  return 0;
}
`,
  );
  const byName = new Map(measured.functions.map((fn) => [fn.name, fn.lines]));
  assert.equal(byName.get("tiny"), 1);
  assert.equal(byName.get("eight"), 8);
});

test("an unallowlisted function over 50 lines fails with the file, the function, and what to do", () => {
  const body = `${"  const x = 1;\n".repeat(50)}`;
  const findings = evaluateQuality(
    input({ files: withFillers(fileWith("src/long.ts", `export function draw() {\n${body}}\n`)) }),
  );
  const functionSize = findings.find((finding) => finding.check === "function-size");
  assert.ok(functionSize, "expected a function-size finding");
  assert.equal(functionSize.location, "src/long.ts draw");
  assert.match(functionSize.message, /52 lines is over the 50-line limit/);
});

test("a function-length ceiling may shrink only by tightening it, and may never grow", () => {
  const body = (count: number): string => `${"  const x = 1;\n".repeat(count)}`;
  const at = (count: number, ceiling: number): QualityInput =>
    input({
      files: withFillers(fileWith("src/long.ts", `export function draw() {\n${body(count)}}\n`)),
      allowlist: { ...EMPTY, functionLength: [{ ...DEBT, file: "src/long.ts", function: "draw", lines: ceiling }] },
    });

  assert.deepEqual(evaluateQuality(at(60, 62)), []);
  assert.match(
    evaluateQuality(at(61, 62))
      .map((finding) => finding.message)
      .join("\n"),
    /grew from 62 to 63/,
  );
  assert.match(
    evaluateQuality(at(58, 62))
      .map((finding) => finding.message)
      .join("\n"),
    /is now 60 lines; set this entry to 60/,
  );

  const under = evaluateQuality(
    input({
      files: withFillers(fileWith("src/short.ts", "export function draw() {\n  return 1;\n}\n")),
      allowlist: { ...EMPTY, functionLength: [{ ...DEBT, file: "src/short.ts", function: "draw", lines: 51 }] },
    }),
  );
  assert.match(
    under.map((finding) => finding.message).join("\n"),
    /is now at or under 50 lines; remove this allowlist entry/,
  );

  const stale = evaluateQuality(
    input({
      files: withFillers(),
      allowlist: { ...EMPTY, functionLength: [{ ...DEBT, file: "src/gone.ts", function: "draw", lines: 51 }] },
    }),
  );
  assert.match(stale.map((finding) => finding.message).join("\n"), /no such function; remove this allowlist entry/);
});

test("line counts match wc -l and the median is the middle value", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("a\nb"), 2);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test("boundary rules flag a detector importing the network and an adapter importing a detector", () => {
  const detector = measureFile(
    "src/detectors/x.ts",
    'import { request } from "node:https";\nexport const f = () => fetch("https://example.com");\n',
  );
  assert.equal(detector.boundary.get("no-network"), 2);

  const adapter = measureFile(
    "src/cli.ts",
    'import { DetectorX } from "./detectors/x.js";\nexport { y } from "./detectors/y.js";\n',
  );
  assert.equal(adapter.boundary.get("adapters-no-detectors"), 2);

  const engine = measureFile("src/engine/detect.ts", 'import type { D } from "../detectors/index.js";\n');
  assert.equal(engine.boundary.get("engine-no-detectors"), 1);

  const clean = measureFile(
    "src/detectors/y.ts",
    'import { join } from "node:path";\nimport { x } from "../domain.js";\n',
  );
  assert.equal(clean.boundary.size, 0);
});

test("an unallowlisted offender fails with the file, the function, and what to do", () => {
  const findings = evaluateQuality(
    input({
      files: [
        fileWith("src/big.ts", `export function tangled(a: number) {\n${"  if (a) a++;\n".repeat(15)}  return a;\n}\n`),
      ],
    }),
  );
  const complexity = findings.find((finding) => finding.check === "complexity");
  assert.ok(complexity, "expected a complexity finding");
  assert.equal(complexity.location, "src/big.ts tangled");
  assert.match(complexity.message, /over 15/);
});

test("a file over 800 lines fails unless it is allowlisted at its current size", () => {
  const lines = "const x = 1;\n".repeat(900);
  const unlisted = evaluateQuality(input({ files: withFillers(fileWith("src/long.ts", lines)) }));
  assert.match(unlisted.map((finding) => finding.message).join("\n"), /800-line limit/);

  const listed = evaluateQuality(
    input({
      files: withFillers(fileWith("src/long.ts", lines)),
      allowlist: { ...EMPTY, fileSize: [{ ...DEBT, file: "src/long.ts", lines: 900 }] },
    }),
  );
  assert.deepEqual(listed, []);
});

test("an allowlist ceiling may shrink only by tightening it, and may never grow", () => {
  const lines = "const x = 1;\n".repeat(900);
  const grew = evaluateQuality(
    input({
      files: withFillers(fileWith("src/long.ts", `${lines}const y = 2;\n`)),
      allowlist: { ...EMPTY, fileSize: [{ ...DEBT, file: "src/long.ts", lines: 900 }] },
    }),
  );
  assert.match(grew.map((finding) => finding.message).join("\n"), /grew from 900 to 901/);

  const shrank = evaluateQuality(
    input({
      files: withFillers(fileWith("src/long.ts", "const x = 1;\n".repeat(850))),
      allowlist: { ...EMPTY, fileSize: [{ ...DEBT, file: "src/long.ts", lines: 900 }] },
    }),
  );
  assert.match(shrank.map((finding) => finding.message).join("\n"), /is now 850 lines; set this entry to 850/);
});

test("an entry that no longer matches a violation is stale, and an expired entry fails", () => {
  const stale = evaluateQuality(
    input({
      files: [fileWith("src/small.ts", "export const a = 1;\n")],
      allowlist: { ...EMPTY, fileSize: [{ ...DEBT, file: "src/small.ts", lines: 1 }] },
    }),
  );
  assert.match(stale.map((finding) => finding.message).join("\n"), /now under 800 lines; remove this allowlist entry/);

  const expired = evaluateQuality(
    input({
      today: "2027-01-27",
      files: withFillers(fileWith("src/long.ts", "const x = 1;\n".repeat(900))),
      allowlist: { ...EMPTY, fileSize: [{ ...DEBT, file: "src/long.ts", lines: 900 }] },
    }),
  );
  assert.match(expired.map((finding) => finding.message).join("\n"), /expired on 2027-01-26/);
});

test("explicit any, @ts-ignore, and new as unknown as fail; non-null assertions are a ceiling", () => {
  const measured = measureFile(
    "src/t.ts",
    [
      "const a: any = 1;",
      "// @ts-ignore",
      "const b = JSON.parse(x) as unknown as { y: number };",
      "const c = maybe!.value;",
      "",
    ].join("\n"),
  );
  assert.equal(measured.explicitAny, 1);
  assert.equal(measured.tsDirectives, 1);
  assert.equal(measured.asUnknownAs, 1);
  assert.equal(measured.nonNull, 1);

  const findings = evaluateQuality(input({ files: [measured] })).map((finding) => finding.message);
  assert.ok(findings.some((message) => /explicit `any`/.test(message)));
  assert.ok(findings.some((message) => /`@ts-ignore`/.test(message)));
  assert.ok(findings.some((message) => /new `as unknown as`/.test(message)));
  assert.ok(findings.some((message) => /non-null assertions and no allowlist entry/.test(message)));
});

test("non-null assertions are a ceiling per file: a matching entry passes and a raised one fails", () => {
  const twice = "const a = b!;\nconst c = d!;\n";
  const matches = evaluateQuality(
    input({
      files: withFillers(fileWith("src/a.ts", twice)),
      allowlist: { ...EMPTY, nonNull: [{ ...DEBT, file: "src/a.ts", count: 2 }] },
    }),
  );
  assert.deepEqual(matches, []);

  const raised = evaluateQuality(
    input({
      files: withFillers(fileWith("src/a.ts", twice)),
      allowlist: { ...EMPTY, nonNull: [{ ...DEBT, file: "src/a.ts", count: 1 }] },
    }),
  );
  assert.match(raised.map((finding) => finding.message).join("\n"), /grew from 1 to 2/);
});

test("a pull request that removes non-null assertions lowers only that file's entry", () => {
  const files = withFillers(fileWith("src/a.ts", "const a = b!;\n"), fileWith("src/b.ts", "const c = d!;\n"));
  const untightened = evaluateQuality(
    input({
      files,
      allowlist: {
        ...EMPTY,
        nonNull: [
          { ...DEBT, file: "src/a.ts", count: 2 },
          { ...DEBT, file: "src/b.ts", count: 1 },
        ],
      },
    }),
  );
  assert.match(untightened.map((finding) => finding.message).join("\n"), /is now 1; set this entry to 1/);

  const tightened = evaluateQuality(
    input({
      files,
      allowlist: {
        ...EMPTY,
        nonNull: [
          { ...DEBT, file: "src/a.ts", count: 1 },
          { ...DEBT, file: "src/b.ts", count: 1 },
        ],
      },
    }),
  );
  assert.deepEqual(tightened, []);
});

test("a new file with non-null assertions fails, and a stale or missing non-null entry fails", () => {
  const added = evaluateQuality(input({ files: withFillers(fileWith("src/new.ts", "const a = b!;\n")) }));
  assert.match(added.map((finding) => finding.message).join("\n"), /1 non-null assertions and no allowlist entry/);

  const stale = evaluateQuality(
    input({
      files: withFillers(fileWith("src/clean.ts", "export const a = 1;\n")),
      allowlist: { ...EMPTY, nonNull: [{ ...DEBT, file: "src/clean.ts", count: 1 }] },
    }),
  );
  assert.match(
    stale.map((finding) => finding.message).join("\n"),
    /no non-null assertions remain; remove this allowlist entry/,
  );

  const missing = evaluateQuality(
    input({
      files: withFillers(),
      allowlist: { ...EMPTY, nonNull: [{ ...DEBT, file: "src/gone.ts", count: 1 }] },
    }),
  );
  assert.match(missing.map((finding) => finding.message).join("\n"), /the file no longer exists/);
});

test("non-null entries are one per file with a whole-number count; the old single total is refused", () => {
  const { allowlist, problems } = parseAllowlist({
    schemaVersion: ALLOWLIST_SCHEMA,
    nonNull: [
      { file: "src/a.ts", count: 1.5, owner: "#2223", expires: MAX_EXPIRY, reason: "x" },
      { count: 1, owner: "#2223", expires: MAX_EXPIRY, reason: "x" },
    ],
  });
  const messages = problems.map((problem) => problem.message).join("\n");
  assert.match(messages, /count must be a whole number/);
  assert.match(messages, /file must be a non-empty string/);
  assert.equal(allowlist.nonNull[0]?.file, "src/a.ts");

  const single = parseAllowlist({
    schemaVersion: ALLOWLIST_SCHEMA,
    nonNull: { count: 589, owner: "#2223", expires: MAX_EXPIRY, reason: "x" },
  });
  assert.equal(single.problems[0]?.location, "nonNull");
  assert.match(single.problems[0]?.message ?? "", /must be an array of objects/);
});

test("as unknown as casts are a ceiling per file: a matching entry passes and a raised one fails", () => {
  const casts = "const a = b as unknown as X;\nconst c = d as unknown as Y;\n";
  const matches = evaluateQuality(
    input({
      files: withFillers(fileWith("src/a.ts", casts)),
      allowlist: { ...EMPTY, asUnknownAs: [{ ...DEBT, file: "src/a.ts", count: 2 }] },
    }),
  );
  assert.deepEqual(matches, []);

  const raised = evaluateQuality(
    input({
      files: withFillers(fileWith("src/a.ts", casts)),
      allowlist: { ...EMPTY, asUnknownAs: [{ ...DEBT, file: "src/a.ts", count: 1 }] },
    }),
  );
  assert.match(raised.map((finding) => finding.message).join("\n"), /`as unknown as` grew from 1 to 2/);
});

test("as unknown as entries parse per file, and a stale or missing entry fails", () => {
  const { allowlist, problems } = parseAllowlist({
    schemaVersion: ALLOWLIST_SCHEMA,
    asUnknownAs: [{ file: "src/a.ts", count: 2, owner: "#2230", expires: MAX_EXPIRY, reason: "x" }],
  });
  assert.deepEqual(problems, []);
  assert.equal(allowlist.asUnknownAs[0]?.count, 2);

  const stale = evaluateQuality(
    input({
      files: withFillers(fileWith("src/clean.ts", "export const a = 1;\n")),
      allowlist: { ...EMPTY, asUnknownAs: [{ ...DEBT, file: "src/clean.ts", count: 1 }] },
    }),
  );
  assert.match(
    stale.map((finding) => finding.message).join("\n"),
    /no `as unknown as` remain; remove this allowlist entry/,
  );

  const missing = evaluateQuality(
    input({
      files: withFillers(),
      allowlist: { ...EMPTY, asUnknownAs: [{ ...DEBT, file: "src/gone.ts", count: 1 }] },
    }),
  );
  assert.match(missing.map((finding) => finding.message).join("\n"), /the file no longer exists/);
});

test("the report totals each section and splits complexity and non-null by directory, largest first", () => {
  const text = renderReport({
    ...EMPTY,
    complexity: [
      { ...DEBT, file: "src/a.ts", function: "f", complexity: 16 },
      { ...DEBT, file: "src/commands/b.ts", function: "g", complexity: 17 },
      { ...DEBT, file: "src/commands/c.ts", function: "h", complexity: 18 },
    ],
    functionLength: [
      { ...DEBT, file: "src/a.ts", function: "f", lines: 60 },
      { ...DEBT, file: "src/fix/x.ts", function: "g", lines: 70 },
    ],
    nonNull: [
      { ...DEBT, file: "src/a.ts", count: 3 },
      { ...DEBT, file: "src/fix/x.ts", count: 10 },
    ],
  });
  assert.match(text, /^complexity +3 +functions over 15$/m);
  assert.match(text, /^function size +2 +functions over 50$/m);
  assert.match(text, /^non-null +13 +non-null assertions$/m);
  assert.match(text, /^  src\/commands +2$/m);
  assert.match(text, /^  src +1$/m);
  assert.match(text, /function size by directory \(functions over 50\)/);
  const complexityLines = text.slice(text.indexOf("complexity by directory (functions over 15)"));
  assert.ok(
    complexityLines.search(/^  src\/commands +2$/m) < complexityLines.search(/^  src +1$/m),
    "the larger complexity directory comes first",
  );
  const nonNullLines = text.slice(text.indexOf("non-null by directory (assertions)"));
  assert.ok(
    nonNullLines.search(/^  src\/fix +10$/m) < nonNullLines.search(/^  src +3$/m),
    "the larger non-null directory comes first",
  );
  assert.equal(renderReport({ ...EMPTY }).includes("complexity by directory (functions over 15)\n\n"), true);
});

test("the report prints the committed allowlist's non-null total", async () => {
  const repository = await readRepository(ROOT, TODAY);
  const total = repository.allowlist.nonNull.reduce((sum, entry) => sum + entry.count, 0);
  assert.match(renderReport(repository.allowlist), new RegExp(`^non-null +${total} `, "m"));
});

test("allowlist entries need an issue owner, a date no later than the phase end, and a reason", () => {
  const { problems } = parseAllowlist({
    schemaVersion: ALLOWLIST_SCHEMA,
    fileSize: [{ file: "src/a.ts", lines: 900, owner: "later", expires: "2028-01-01", reason: "" }],
  });
  const messages = problems.map((problem) => problem.message).join("\n");
  assert.match(messages, /owner must be an issue number/);
  assert.match(messages, /expires must be a date on or before 2027-01-26/);
  assert.match(messages, /reason must say why/);
});

test("the schema version is required", () => {
  const { problems } = parseAllowlist({ fileSize: [] });
  assert.match(problems[0]?.message ?? "", /schemaVersion must be/);
});

test("high and critical advisories cannot be allowlisted; a moderate one can", () => {
  const audit = [
    { id: "GHSA-high", package: "a", severity: "high" },
    { id: "GHSA-mod", package: "b", severity: "moderate" },
  ];
  const allowed = {
    ...EMPTY,
    audit: [
      { ...DEBT, advisory: "GHSA-high", package: "a" },
      { ...DEBT, advisory: "GHSA-mod", package: "b" },
    ],
  };
  const findings = evaluateQuality(input({ audit, allowlist: allowed })).map((finding) => finding.message);
  assert.ok(findings.some((message) => /high advisory .* never allowlisted/.test(message)));
  assert.equal(
    findings.some((message) => /GHSA-mod/.test(message)),
    false,
  );
});

test("npm audit JSON is reduced to one row per advisory", () => {
  const rows = parseAudit({
    vulnerabilities: {
      lodash: {
        severity: "moderate",
        via: [{ url: "https://github.com/advisories/GHSA-aaaa", severity: "moderate" }],
      },
    },
  });
  assert.deepEqual(rows, [{ id: "GHSA-aaaa", package: "lodash", severity: "moderate" }]);
  assert.deepEqual(parseAudit({}), []);
});

test("only hand-written src files are measured", () => {
  assert.equal(isHandWritten("src/engine.ts"), true);
  assert.equal(isHandWritten("src/usage/vendor/tree-sitter.ts"), false);
  assert.equal(isHandWritten("src/commands/index.generated.ts"), false);
  assert.equal(isHandWritten("tests/engine.test.ts"), false);
});

test("arguments are parsed and unknown ones are refused", () => {
  assert.deepEqual(parseArguments(["--today", "2026-11-02"]), { today: "2026-11-02" });
  assert.deepEqual(parseArguments(["--audit", "audit.json"]).audit, "audit.json");
  assert.equal(parseArguments(["--report"]).report, true);
  assert.equal(parseArguments(["--against", "origin/main"]).against, "origin/main");
  assert.throws(() => parseArguments(["--against"]), /--against needs a git ref/);
  assert.throws(() => parseArguments(["--nope"]), /unknown argument/);
});

test("a raised allowlist ceiling or a new entry fails the gate comparison", () => {
  const baseline: Allowlist = {
    ...EMPTY,
    fileSize: [{ ...DEBT, file: "src/long.ts", lines: 900 }],
  };
  const raised = compareAllowlists(baseline, {
    ...EMPTY,
    fileSize: [{ ...DEBT, file: "src/long.ts", lines: 950 }],
  });
  assert.match(raised.map((finding) => finding.message).join("\n"), /lines raised from 900 to 950/);

  const added = compareAllowlists(baseline, {
    ...EMPTY,
    fileSize: [
      { ...DEBT, file: "src/long.ts", lines: 900 },
      { ...DEBT, file: "src/other.ts", lines: 850 },
    ],
  });
  assert.match(added.map((finding) => finding.message).join("\n"), /new allowlist entry/);
});

test("a looser TARGETS limit fails, and parseTargets reads the table from source", () => {
  const looser = compareTargets(TARGETS, { ...TARGETS, complexity: TARGETS.complexity + 1 });
  assert.equal(looser[0]?.location, "TARGETS.complexity");
  assert.match(looser[0]?.message ?? "", /limit loosened from 15 to 16/);

  const parsed = parseTargets(
    `export const TARGETS = {\n  medianLines: 300,\n  warnLines: 800,\n  ceilingLines: 1000,\n  functionLines: 50,\n  complexity: 15,\n} as const;\n`,
  );
  assert.deepEqual(parsed, TARGETS);
  assert.equal(parseTargets("export const OTHER = 1;\n"), null);
});

test("a limit the base ref lacks is new and passes; removing a limit it has fails", () => {
  assert.deepEqual(compareTargets({ complexity: 15 }, { ...TARGETS }), []);
  const removed = compareTargets(TARGETS, {
    medianLines: TARGETS.medianLines,
    warnLines: TARGETS.warnLines,
    ceilingLines: TARGETS.ceilingLines,
    complexity: TARGETS.complexity,
  });
  assert.deepEqual(
    removed.map((finding) => finding.location),
    ["TARGETS.functionLines"],
  );
  assert.match(removed[0]?.message ?? "", /limit removed/);
});

test("an allowlist section the base ref lacks is new, so its entries are not rejected as additions", () => {
  const current: Allowlist = {
    ...EMPTY,
    functionLength: [{ ...DEBT, file: "src/a.ts", function: "f", lines: 60 }],
  };
  assert.match(
    compareAllowlists(EMPTY, current)
      .map((finding) => finding.message)
      .join("\n"),
    /new allowlist entry/,
  );
  assert.deepEqual(compareAllowlists(EMPTY, current, { baselineSections: new Set(["fileSize"]) }), []);
});

test("lowering or deleting an allowlist entry passes the gate comparison", () => {
  const baseline: Allowlist = {
    ...EMPTY,
    fileSize: [
      { ...DEBT, file: "src/long.ts", lines: 900 },
      { ...DEBT, file: "src/gone.ts", lines: 850 },
    ],
    complexity: [{ ...DEBT, file: "src/a.ts", function: "f", complexity: 20 }],
  };
  const tightened = compareAllowlists(baseline, {
    ...EMPTY,
    fileSize: [{ ...DEBT, file: "src/long.ts", lines: 850 }],
    complexity: [{ ...DEBT, file: "src/a.ts", function: "f", complexity: 16 }],
  });
  assert.deepEqual(tightened, []);
  assert.deepEqual(compareTargets(TARGETS, { ...TARGETS, complexity: TARGETS.complexity - 1 }), []);
});

test("findings render one per line with a pointer to the rules", () => {
  const text = renderFindings([{ check: "file-size", location: "src/a.ts", message: "too long" }]);
  assert.match(text, /^file-size: src\/a\.ts: too long\n/);
  assert.match(text, /docs\/QUALITY\.md/);
  assert.equal(renderFindings([]), "");
});

test("the committed allowlist parses and holds for the repository as it is", async () => {
  const repository = await readRepository(ROOT, TODAY);
  assert.deepEqual(repository.allowlistProblems, []);
  assert.deepEqual(evaluateQuality(repository), []);
});

test("the committed allowlist is empty, and the gate rejects any entry in any section", async () => {
  const repository = await readRepository(ROOT, TODAY);
  assert.deepEqual(allowlistDebtFindings(repository.allowlist), []);
  const { allowlist } = parseAllowlist({
    schemaVersion: ALLOWLIST_SCHEMA,
    functionLength: [{ file: "src/a.ts", function: "run", lines: 60, ...DEBT }],
    audit: [{ advisory: "GHSA-mod", package: "x", ...DEBT }],
  });
  assert.equal(allowlistDebtFindings(allowlist).length, 2);
});
