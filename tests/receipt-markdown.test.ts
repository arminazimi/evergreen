import assert from "node:assert/strict";
import { test } from "node:test";

import type { Receipt, ReceiptFinding } from "../src/receipt.js";
import { RECEIPT_SCHEMA } from "../src/receipt.js";
import { RECEIPT_MARKER, receiptVerdict, renderReceiptMarkdown } from "../src/receipt-markdown.js";

const hostile = '<script>alert("x")</script> | \\ [label](javascript:alert(1)) &';

function entry(
  id: string,
  overrides: Partial<ReceiptFinding> = {},
): ReceiptFinding {
  return {
    id,
    rule: "demo.eol",
    title: `Title ${id}`,
    severity: "high",
    path: `${id}.yml`,
    line: 1,
    ...overrides,
  };
}

function receipt(partial: Partial<Receipt> & Pick<Receipt, "resolved" | "remaining" | "introduced">): Receipt {
  const { resolved, remaining, introduced } = partial;
  return {
    schema: RECEIPT_SCHEMA,
    counts: {
      resolved: resolved.length,
      remaining: remaining.length,
      introduced: introduced.length,
    },
    resolved,
    remaining,
    introduced,
    commands: partial.commands ?? [],
    data: partial.data ?? { before: null, after: null },
  };
}

test("clean verdict: empty change", () => {
  const markdown = renderReceiptMarkdown(receipt({ resolved: [], remaining: [], introduced: [] }));
  assert.equal(receiptVerdict(receipt({ resolved: [], remaining: [], introduced: [] })), "clean");
  assert.equal(
    markdown,
    [
      RECEIPT_MARKER,
      "## Evergreen receipt: No findings",
      "",
      "| Resolved | Remaining | Introduced |",
      "| --- | --- | --- |",
      "| 0 | 0 | 0 |",
      "",
      "### Resolved",
      "",
      "_None._",
      "",
      "### Remaining",
      "",
      "_None._",
      "",
      "### Introduced",
      "",
      "_None._",
      "",
    ].join("\n"),
  );
});

test("resolved verdict: every finding cleared", () => {
  const markdown = renderReceiptMarkdown(
    receipt({
      resolved: [entry("a"), entry("b", { severity: "medium", path: "package.json", line: 7 })],
      remaining: [],
      introduced: [],
      commands: [{ command: "npm test", purpose: "run the suite" }],
    }),
  );
  assert.equal(
    receiptVerdict(
      receipt({
        resolved: [entry("a")],
        remaining: [],
        introduced: [],
      }),
    ),
    "resolved",
  );
  assert.equal(
    markdown,
    [
      RECEIPT_MARKER,
      "## Evergreen receipt: All findings resolved",
      "",
      "| Resolved | Remaining | Introduced |",
      "| --- | --- | --- |",
      "| 2 | 0 | 0 |",
      "",
      "### Resolved",
      "",
      "| Severity | Finding | Location |",
      "| --- | --- | --- |",
      "| high | Title a | a\\.yml:1 |",
      "| medium | Title b | package\\.json:7 |",
      "",
      "### Remaining",
      "",
      "_None._",
      "",
      "### Introduced",
      "",
      "_None._",
      "",
      "### Suggested commands",
      "",
      "```",
      "npm test  # run the suite",
      "```",
      "",
    ].join("\n"),
  );
});

test("unchanged verdict: findings remain and nothing moved", () => {
  const withoutLine: ReceiptFinding = {
    id: "a",
    rule: "demo.eol",
    title: "Title a",
    severity: "high",
    path: "a.yml",
  };
  const markdown = renderReceiptMarkdown(
    receipt({
      resolved: [],
      remaining: [withoutLine],
      introduced: [],
    }),
  );
  assert.equal(receiptVerdict(receipt({ resolved: [], remaining: [entry("a")], introduced: [] })), "unchanged");
  assert.equal(
    markdown,
    [
      RECEIPT_MARKER,
      "## Evergreen receipt: Findings remain",
      "",
      "| Resolved | Remaining | Introduced |",
      "| --- | --- | --- |",
      "| 0 | 1 | 0 |",
      "",
      "### Resolved",
      "",
      "_None._",
      "",
      "### Remaining",
      "",
      "| Severity | Finding | Location |",
      "| --- | --- | --- |",
      "| high | Title a | a\\.yml |",
      "",
      "### Introduced",
      "",
      "_None._",
      "",
    ].join("\n"),
  );
});

test("partial verdict: some resolved, some remain", () => {
  const markdown = renderReceiptMarkdown(
    receipt({
      resolved: [entry("a")],
      remaining: [entry("b")],
      introduced: [],
    }),
  );
  assert.equal(receiptVerdict(receipt({ resolved: [entry("a")], remaining: [entry("b")], introduced: [] })), "partial");
  assert.equal(
    markdown,
    [
      RECEIPT_MARKER,
      "## Evergreen receipt: Partially resolved",
      "",
      "| Resolved | Remaining | Introduced |",
      "| --- | --- | --- |",
      "| 1 | 1 | 0 |",
      "",
      "### Resolved",
      "",
      "| Severity | Finding | Location |",
      "| --- | --- | --- |",
      "| high | Title a | a\\.yml:1 |",
      "",
      "### Remaining",
      "",
      "| Severity | Finding | Location |",
      "| --- | --- | --- |",
      "| high | Title b | b\\.yml:1 |",
      "",
      "### Introduced",
      "",
      "_None._",
      "",
    ].join("\n"),
  );
});

test("introduced verdict: new findings win the heading", () => {
  const markdown = renderReceiptMarkdown(
    receipt({
      resolved: [entry("a")],
      remaining: [entry("b")],
      introduced: [entry("c")],
      commands: [
        { command: "npm run build", purpose: "compile" },
        { command: "npm test", purpose: "run tests" },
      ],
    }),
  );
  assert.equal(
    receiptVerdict(receipt({ resolved: [entry("a")], remaining: [], introduced: [entry("c")] })),
    "introduced",
  );
  assert.equal(
    markdown,
    [
      RECEIPT_MARKER,
      "## Evergreen receipt: New findings introduced",
      "",
      "| Resolved | Remaining | Introduced |",
      "| --- | --- | --- |",
      "| 1 | 1 | 1 |",
      "",
      "### Resolved",
      "",
      "| Severity | Finding | Location |",
      "| --- | --- | --- |",
      "| high | Title a | a\\.yml:1 |",
      "",
      "### Remaining",
      "",
      "| Severity | Finding | Location |",
      "| --- | --- | --- |",
      "| high | Title b | b\\.yml:1 |",
      "",
      "### Introduced",
      "",
      "| Severity | Finding | Location |",
      "| --- | --- | --- |",
      "| high | Title c | c\\.yml:1 |",
      "",
      "### Suggested commands",
      "",
      "```",
      "npm run build  # compile",
      "npm test  # run tests",
      "```",
      "",
    ].join("\n"),
  );
});

test("escapes hostile titles and paths, and never prints absolute paths", () => {
  const markdown = renderReceiptMarkdown(
    receipt({
      resolved: [
        entry("x", {
          title: hostile,
          path: `/Users/me/repo/${hostile}`,
          line: 3,
        }),
      ],
      remaining: [],
      introduced: [],
    }),
  );

  assert.ok(markdown.startsWith(RECEIPT_MARKER));
  assert.ok(!markdown.includes("<script>"));
  assert.ok(markdown.includes("&lt;script&gt;"));
  assert.ok(markdown.includes("&#124;"));
  assert.ok(markdown.includes("&#92;"));
  assert.ok(!markdown.includes("/Users/me/repo/"));
  assert.ok(markdown.includes(escapeSnippet(hostile)));
  assert.equal(markdown, renderReceiptMarkdown(
    receipt({
      resolved: [
        entry("x", {
          title: hostile,
          path: `/Users/me/repo/${hostile}`,
          line: 3,
        }),
      ],
      remaining: [],
      introduced: [],
    }),
  ));
});

test("long finding lists collapse into details and a typical receipt stays short", () => {
  const resolved = Array.from({ length: 6 }, (_, index) => entry(String.fromCharCode(97 + index)));
  const markdown = renderReceiptMarkdown(receipt({ resolved, remaining: [], introduced: [] }));
  assert.ok(markdown.includes("<details>"));
  assert.ok(markdown.includes("<summary>6 resolved</summary>"));
  assert.ok(markdown.includes("</details>"));
  assert.ok(markdown.includes("| high | Title a | a\\.yml:1 |"));
  assert.ok(markdown.includes("| high | Title f | f\\.yml:1 |"));

  const typical = renderReceiptMarkdown(
    receipt({
      resolved: [entry("a")],
      remaining: [entry("b")],
      introduced: [],
      commands: [{ command: "npm test", purpose: "verify" }],
    }),
  );
  assert.ok(typical.split("\n").length <= 60);
});

/** Same escaping the renderer applies, for asserting the hostile title appears escaped. */
function escapeSnippet(value: string): string {
  const escapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "|": "&#124;",
    "\\": "&#92;",
  };
  return value.replace(/[&<>|\\\x60*_{}\[\]()#+\-.!]/g, (character) => escapes[character] ?? "\\" + character);
}
