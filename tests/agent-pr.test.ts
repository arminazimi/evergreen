import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_AGENT_AUTHORS, matchesAgentAuthor, parseAgentAuthors, renderAgentSection } from "../src/agent-pr.js";
import type { Finding } from "../src/domain.js";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "npm.left-pad.deprecated:package.json:3",
    ruleId: "npm.left-pad.deprecated",
    detector: "npm",
    title: "Deprecated package",
    summary: "left-pad is deprecated.",
    severity: "medium",
    confidence: "exact",
    location: { path: "package.json", line: 3 },
    replacement: "left-pad@2",
    sources: [{ title: "npm deprecation", url: "https://example.com/notice" }],
    ...overrides,
  };
}

test("the default agent authors match regardless of case or a leading @", () => {
  const authors = parseAgentAuthors(undefined);
  for (const login of DEFAULT_AGENT_AUTHORS) {
    assert.ok(matchesAgentAuthor(login, authors), login);
    assert.ok(matchesAgentAuthor(login.toUpperCase(), authors), login);
  }
  assert.ok(matchesAgentAuthor("@Copilot", authors));
  assert.equal(matchesAgentAuthor("octocat", authors), false);
  assert.equal(matchesAgentAuthor(undefined, authors), false);
  assert.equal(parseAgentAuthors("  ").size, DEFAULT_AGENT_AUTHORS.length);
});

test("a custom list replaces the default list", () => {
  const authors = parseAgentAuthors("my-agent[bot], @someone, ");
  assert.deepEqual([...authors].sort(), ["my-agent[bot]", "someone"]);
  assert.ok(matchesAgentAuthor("Someone", authors));
  assert.equal(matchesAgentAuthor("Copilot", authors), false);
});

test("agent-authors: none turns the section off", () => {
  const authors = parseAgentAuthors(" None ");
  assert.equal(authors.size, 0);
  assert.equal(matchesAgentAuthor("Copilot", authors), false);
});

test("the agent section lists each introduced finding with its replacement and evidence", () => {
  const withoutReplacement: Finding = {
    id: "x:src/app.ts",
    ruleId: "x",
    detector: "npm",
    title: "Removed | API",
    summary: "s",
    severity: "low",
    confidence: "exact",
    location: { path: "src/app.ts" },
    sources: [],
  };
  const text = renderAgentSection([finding(), withoutReplacement]).join("\n");

  assert.match(text, /^## Stale choices this agent introduced$/m);
  assert.ok(
    text.includes(
      "| `package.json:3` | Deprecated package | left-pad@2 | [npm deprecation](https://example.com/notice) |",
    ),
    text,
  );
  assert.ok(text.includes("| `src/app.ts` | Removed \\| API | — | — |"), text);
  assert.ok(text.endsWith("Replace these and push again; Evergreen will re-check.\n"), text);
});

test("table cells escape a backslash before the pipe it precedes", () => {
  const text = renderAgentSection([finding({ title: "Back\\slash | pipe", replacement: "a\\b | c" })]).join("\n");

  assert.ok(text.includes("Back\\\\slash \\| pipe"), text);
  assert.ok(text.includes("a\\\\b \\| c"), text);
});

test("there is no section for a pull request without introduced findings", () => {
  assert.deepEqual(renderAgentSection([]), []);
});

test("the section keeps ten findings and points at the report for the rest", () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    finding({ id: `r${index}:package.json:1`, title: `Finding ${index}`, location: { path: "package.json", line: 1 } }),
  );
  const text = renderAgentSection(many).join("\n");

  assert.equal(text.split("\n").filter((line) => line.startsWith("| `package.json:1`")).length, 10);
  assert.match(text, /…and 2 more; the JSON report artifact lists every finding\./);
});
