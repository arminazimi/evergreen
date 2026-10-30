import assert from "node:assert/strict";
import { test } from "node:test";

import type { Finding } from "../src/domain.js";
import { PR_COMMENT_MARKER, renderComment } from "../src/github-action.js";

const finding = (index: number, severity: Finding["severity"] = "low"): Finding => ({
  id: `rule${index}.pkg:package.json:${index + 1}`,
  ruleId: `rule${index}.pkg`,
  detector: "npm",
  title: `Finding ${index + 1}`,
  summary: "s",
  severity,
  confidence: "exact",
  location: { path: "package.json", line: index + 1 },
  sources: [{ title: "Vendor", url: "https://example.com/notice" }],
});

const diff = (fixed: Finding[], unchanged: number) => ({ base: "base123", head: "head456", fixed, unchanged });

test("the pull request comment lists the findings this pull request resolved", () => {
  const body = renderComment([], false, "high", undefined, false, undefined, diff([finding(0, "high"), finding(1)], 3));
  assert.equal(
    body,
    [
      `${PR_COMMENT_MARKER}\n## Evergreen`,
      "",
      "Found **0** lifecycle findings introduced by this pull request (base123..head456); passed the severity gate.",
      "",
      "Fixed by this pull request: **2** findings (3 unchanged).",
      "",
      "| Severity | Fixed finding | Location |",
      "|---|---|---|",
      "| high | Finding 1 | `package.json:1` |",
      "| low | Finding 2 | `package.json:2` |",
      "",
    ].join("\n"),
  );
});

test("the comment is unchanged when the pull request resolved nothing", () => {
  const body = renderComment([], false, "high", undefined, false, undefined, diff([], 4));
  assert.equal(
    body,
    [
      `${PR_COMMENT_MARKER}\n## Evergreen`,
      "",
      "Found **0** lifecycle findings introduced by this pull request (base123..head456); passed the severity gate.",
      "",
      "Fixed by this pull request: **0** findings (4 unchanged).",
      "",
    ].join("\n"),
  );
  assert.equal(body.includes("| Severity | Fixed finding | Location |"), false, "no table when nothing was resolved");
  assert.equal(renderComment([], false, "high", undefined, false).includes("Fixed by this pull request"), false, "a scan-mode comment has no resolved section");
});

test("more than ten resolved findings are capped with a count of the rest", () => {
  const fixed = Array.from({ length: 13 }, (_, index) => finding(index));
  const body = renderComment([], false, "high", undefined, false, undefined, diff(fixed, 0));
  assert.match(body, /Fixed by this pull request: \*\*13\*\* findings \(0 unchanged\)\./);
  assert.equal(body.split("\n").filter((line) => /^\| low \| Finding \d+ \|/.test(line)).length, 10);
  assert.match(body, /…and 3 more\./);
  assert.equal(body.includes("| low | Finding 11 |"), false, "only the first ten are listed");
});
