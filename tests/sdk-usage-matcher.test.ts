import assert from "node:assert/strict";
import { test } from "node:test";

import { isUsageMatcher } from "../src/sdk.js";

const importCapableLanguages = [
  "javascript",
  "typescript",
  "python",
  "go",
  "java",
  "kotlin",
  "rust",
  "csharp",
  "ruby",
  "php",
  "swift",
  "dart",
] as const;

const symbolMatcher = { kind: "symbol", language: "javascript", symbol: "render", shape: "call" };

/** `[matcher, expected]` rows; every matcher kind, and every rule that narrows it. */
const cases: [unknown, boolean][] = [
  ...importCapableLanguages.map((language): [unknown, boolean] => [
    { kind: "import", language, module: "request" },
    true,
  ]),
  [null, false],
  [["request"], false],
  ["request", false],
  [{ kind: "import", language: "elixir", module: "request" }, false],
  [{ kind: "regex", language: "javascript", module: "request" }, false],
  [{ kind: "import", language: "json", module: "request" }, false],
  [{ kind: "import", language: "ruby", module: " " }, false],
  [{ kind: "import", language: "ruby" }, false],

  // A call matcher exists only where the scanner can attribute a call site; the JVM languages import but do not call.
  [{ kind: "call", language: "java", module: "m", targets: ["x"] }, false],
  [{ kind: "call", language: "kotlin", module: "m", targets: ["x"] }, false],
  [{ kind: "call", language: "rust", module: "failure", targets: ["err_msg"] }, true],
  [{ kind: "call", language: "rust", module: "failure", targets: [] }, false],
  [{ kind: "call", language: "rust", module: "failure", targets: [" "] }, false],
  [{ kind: "call", language: "rust", module: "failure" }, false],
  [{ kind: "call", language: "rust", module: "failure", targets: "err_msg" }, false],

  // A symbol matcher is read by the parsers, so it is limited to the three script languages and to known fields.
  [{ ...symbolMatcher, module: "react-dom" }, true],
  [{ kind: "symbol", language: "typescript", symbol: "Buffer", shape: "construct" }, true],
  [{ kind: "symbol", language: "python", symbol: "open", shape: "call" }, true],
  [{ kind: "symbol", language: "go", symbol: "render", shape: "call" }, false],
  [{ kind: "symbol", language: "javascript", symbol: "render" }, false],
  [{ ...symbolMatcher, shape: "import" }, false],
  [{ kind: "symbol", language: "python", symbol: "Widget", shape: "construct" }, false],
  [{ kind: "symbol", language: "python", module: "unittest", symbol: "assertEquals", shape: "method" }, true],
  [{ ...symbolMatcher, shape: "method" }, false],
  [{ ...symbolMatcher, option: "x" }, false],
  [{ ...symbolMatcher, shape: "option" }, false],
  [{ ...symbolMatcher, shape: "option", option: " " }, false],
  [{ ...symbolMatcher, shape: "option", option: "useNewUrlParser", argument: 1 }, true],
  [{ ...symbolMatcher, shape: "option", option: "ssl", argument: 0 }, true],
  [{ ...symbolMatcher, argument: 0 }, false],
  [{ ...symbolMatcher, shape: "option", option: "ssl", argument: -1 }, false],
  [{ ...symbolMatcher, shape: "option", option: "ssl", argument: 1.5 }, false],
  [{ ...symbolMatcher, module: "" }, false],
  [{ ...symbolMatcher, replacement: "createRoot" }, true],
  [{ ...symbolMatcher, replacement: " " }, false],
  [{ ...symbolMatcher, symbol: "render()" }, false],
  [{ ...symbolMatcher, symbol: "a..b" }, false],
  [{ ...symbolMatcher, symbol: "datetime.utcnow" }, true],
  [{ ...symbolMatcher, regex: "render" }, false],

  [{ kind: "config-key", language: "yaml", key: "runtime" }, true],
  [{ kind: "config-key", language: "json", key: "runtime", valueIncludes: "node" }, true],
  [{ kind: "config-key", language: "yaml", key: " " }, false],
  [{ kind: "config-key", language: "yaml" }, false],
  [{ kind: "config-key", language: "toml", key: "runtime", valueIncludes: " " }, false],
];

test("the matcher guard accepts every supported matcher and rejects every malformed one", () => {
  for (const [matcher, expected] of cases) {
    assert.equal(isUsageMatcher(matcher), expected, JSON.stringify(matcher));
  }
});
