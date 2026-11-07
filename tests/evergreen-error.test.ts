import assert from "node:assert/strict";
import { test } from "node:test";

import { ConfigError } from "../src/config.js";
import { DataPinError } from "../src/data-source.js";
import {
  classifyError,
  DEFAULT_REASONS,
  ERROR_CODES,
  EvergreenError,
  EXIT_CODES,
  failureClassOf,
} from "../src/evergreen-error.js";
import { failure } from "../src/mcp/tool-support.js";
import { PurlError } from "../src/purl.js";
import { ScaffoldError } from "../tools/scaffold/index.js";

test("every reason code belongs to a class with an exit code", () => {
  for (const code of Object.keys(ERROR_CODES) as Array<keyof typeof ERROR_CODES>) {
    assert.ok(failureClassOf(code) in EXIT_CODES, code);
  }
  for (const [kind, code] of Object.entries(DEFAULT_REASONS)) {
    assert.equal(ERROR_CODES[code], kind);
  }
});

test("domain errors carry their reason code and class", () => {
  assert.deepEqual(classifyError(new ConfigError("bad")), {
    code: "invalid-config",
    kind: "usage",
  });
  assert.deepEqual(classifyError(new PurlError("bad")), {
    code: "invalid-purl",
    kind: "parse",
  });
  assert.deepEqual(classifyError(new DataPinError("x", true)), {
    code: "invalid-data-version",
    kind: "usage",
  });
  assert.deepEqual(classifyError(new DataPinError("x")), {
    code: "data-unavailable",
    kind: "data",
  });
  assert.deepEqual(classifyError(new ScaffoldError("bad scaffold")), {
    code: "scaffold-failed",
    kind: "usage",
  });
});

test("an error outside the model is internal", () => {
  assert.deepEqual(classifyError(new Error("boom")), {
    code: "internal",
    kind: "internal",
  });
  assert.deepEqual(classifyError("text"), {
    code: "internal",
    kind: "internal",
  });
});

test("an MCP failure reports the code, class, and exit code beside the message", () => {
  const known = failure(new EvergreenError("finding-not-observed", "no such finding"));
  assert.equal(known.isError, true);
  assert.equal(known.content[0]?.text, "no such finding");
  assert.deepEqual(known._meta, {
    evergreen: { code: "finding-not-observed", class: "data", exitCode: 3 },
  });
  assert.deepEqual(failure(new Error("boom"))._meta, {
    evergreen: { code: "internal", class: "internal", exitCode: 5 },
  });
});
