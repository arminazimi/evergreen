import assert from "node:assert/strict";
import { test } from "node:test";

import { badgeState, badgeStyles, contrastRatio, readableTextColor, renderBadgeSvg } from "../src/badge.js";
import { severityValues } from "../src/domain.js";
import type { Finding, Severity } from "../src/domain.js";

const finding = (severity: Severity) => ({ severity }) as unknown as Finding;
const at = (findings: Finding[], stale = false) =>
  ({ findings, data: { stale } }) as unknown as Parameters<typeof badgeState>[0];

const samples = [
  { name: "clean", result: at([]), expired: false },
  { name: "stale", result: at([], true), expired: false },
  ...severityValues.map((severity) => ({ name: severity, result: at([finding(severity)]), expired: false })),
  { name: "expired", result: at([finding("high")]), expired: true },
];

test("every badge state keeps its message text at WCAG AA contrast", () => {
  for (const sample of samples) {
    const background = badgeState(sample.result, sample.expired).color;
    const ratio = contrastRatio(background, readableTextColor(background));
    assert.ok(ratio >= 4.5, `${sample.name}: ${ratio.toFixed(2)}:1 is below WCAG AA`);
  }
  assert.ok(contrastRatio("#0C1110", "#FFFFFF") >= 4.5, "the label area keeps white text readable");
});

test("every style renders a deterministic, self-contained SVG for every state", () => {
  for (const style of badgeStyles) {
    for (const sample of samples) {
      const svg = renderBadgeSvg(sample.result, sample.expired, style);
      assert.match(svg, /^<svg [^>]*role="img" aria-label="[^"]+">/);
      assert.match(svg, /<title>[^<]+<\/title>/);
      assert.match(svg, /<\/svg>$/);
      assert.doesNotMatch(svg, /<script|<image|\b(?:href|src)=|url\(http/i, "no script or external reference");
      assert.equal(renderBadgeSvg(sample.result, sample.expired, style), svg, `${style}/${sample.name} is not deterministic`);
    }
  }
});

test("flat and flat-square differ only in the corner radius", () => {
  const result = at([finding("medium")]);
  const flat = renderBadgeSvg(result, false, "flat");
  const square = renderBadgeSvg(result, false, "flat-square");
  assert.match(flat, /height="20"/);
  assert.match(flat, /rx="3"/);
  assert.match(square, /height="20"/);
  assert.match(square, /rx="0"/);
  assert.doesNotMatch(square, /rx="3"/);
  assert.equal(flat, square.replace(/rx="0"/, 'rx="3"'));
});

test("for-the-badge is larger and uppercases the label and message", () => {
  const svg = renderBadgeSvg(at([finding("high")]), false, "for-the-badge");
  assert.match(svg, /height="28"/);
  assert.match(svg, />EVERGREEN<\/text>/);
  assert.match(svg, />1 HIGH<\/text>/);
  assert.match(svg, /aria-label="evergreen: 1 high"/, "the accessible name keeps the original wording");
});
