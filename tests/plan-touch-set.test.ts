import assert from "node:assert/strict";
import { test } from "node:test";

import type { Finding, SourceUsage } from "../src/domain.js";
import { touchSet } from "../src/plan-touch-set.js";

const SOURCE = { title: "Official notice", url: "https://example.com/notice" };

function finding(overrides: Partial<Finding> & Pick<Finding, "id" | "ruleId" | "detector" | "title" | "location">): Finding {
  return {
    summary: overrides.summary ?? `${overrides.title}.`,
    severity: overrides.severity ?? "high",
    confidence: overrides.confidence ?? "exact",
    sources: overrides.sources ?? [SOURCE],
    ...overrides,
  };
}

function usage(path: string, line: number, symbol: string): SourceUsage {
  return {
    kind: "import",
    language: "typescript",
    symbol,
    location: { path, line, column: 1 },
    excerpt: `import ${symbol} from "${symbol}";`,
  };
}

test("a runtime pin touches only its pin file", () => {
  const pin = finding({
    id: "nodejs.runtime.eol-16:.nvmrc:1",
    ruleId: "nodejs.runtime.eol-16",
    detector: "npm",
    title: "Node.js 16 is end of life",
    location: { path: ".nvmrc", line: 1 },
  });

  assert.deepEqual(
    touchSet(pin, { files: [".nvmrc", "package.json", "package-lock.json", "src/index.ts"] }),
    [".nvmrc"],
  );
});

test("an npm dependency includes the manifest and its lockfile", () => {
  const dependency = finding({
    id: "npm.request:package.json:12",
    ruleId: "npm.request",
    detector: "npm",
    title: "Deprecated request package",
    location: { path: "package.json", line: 12 },
  });

  assert.deepEqual(
    touchSet(dependency, { files: ["package.json", "package-lock.json", "src/index.ts"] }),
    ["package-lock.json", "package.json"],
  );
});

test("an npm workspace package shares the root lockfile", () => {
  const dependency = finding({
    id: "npm.request:packages/api/package.json:8",
    ruleId: "npm.request",
    detector: "npm",
    title: "Deprecated request package",
    location: { path: "packages/api/package.json", line: 8 },
  });

  assert.deepEqual(
    touchSet(dependency, {
      files: [
        "package.json",
        "package-lock.json",
        "packages/api/package.json",
        "packages/web/package.json",
      ],
    }),
    ["package-lock.json", "packages/api/package.json"],
  );
});

test("a GitHub Action finding touches only its workflow file", () => {
  const action = finding({
    id: "github-actions.checkout:.github/workflows/ci.yml:14",
    ruleId: "github-actions.checkout",
    detector: "github-actions",
    title: "Upgrade actions/checkout",
    severity: "medium",
    location: { path: ".github/workflows/ci.yml", line: 14 },
  });

  assert.deepEqual(
    touchSet(action, {
      files: [".github/workflows/ci.yml", "package.json", "package-lock.json"],
    }),
    [".github/workflows/ci.yml"],
  );
});

test("a finding with source usages includes every affected file", () => {
  const withUsages = finding({
    id: "npm.request:package.json:3",
    ruleId: "npm.request",
    detector: "npm",
    title: "Deprecated request package",
    location: { path: "package.json", line: 3 },
    usages: [
      usage("src/client.ts", 1, "request"),
      usage("src/legacy/http.ts", 4, "request"),
      usage("tests/client.test.ts", 2, "request"),
    ],
  });

  assert.deepEqual(
    touchSet(withUsages, {
      files: [
        "package.json",
        "src/client.ts",
        "src/legacy/http.ts",
        "tests/client.test.ts",
      ],
    }),
    ["package.json", "src/client.ts", "src/legacy/http.ts", "tests/client.test.ts"],
  );
});

test("paths are de-duplicated, sorted, and normalised to forward slashes", () => {
  const withUsages = finding({
    id: "npm.request:package.json:3",
    ruleId: "npm.request",
    detector: "npm",
    title: "Deprecated request package",
    location: { path: "package.json", line: 3 },
    usages: [
      usage("src/client.ts", 1, "request"),
      usage("src/client.ts", 2, "request.get"),
      {
        kind: "call",
        language: "typescript",
        symbol: "request",
        location: { path: "src\\legacy\\http.ts", line: 4, column: 1 },
        excerpt: "request(url);",
      },
    ],
  });

  assert.deepEqual(
    touchSet(withUsages, {
      files: ["package.json", "yarn.lock", "src/client.ts", "src/legacy/http.ts"],
    }),
    ["package.json", "src/client.ts", "src/legacy/http.ts", "yarn.lock"],
  );
});

test("a lockfile finding also touches its sibling manifest", () => {
  const locked = finding({
    id: "npm.request:package-lock.json:40",
    ruleId: "npm.request",
    detector: "npm",
    title: "Deprecated request package",
    confidence: "inferred-from-lock",
    location: { path: "package-lock.json", line: 40 },
  });

  assert.deepEqual(
    touchSet(locked, { files: ["package.json", "package-lock.json"] }),
    ["package-lock.json", "package.json"],
  );
});
