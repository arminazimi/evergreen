import assert from "node:assert/strict";
import { test } from "node:test";

import { parseGemfile } from "../src/detectors/ruby/parse-gemfile.js";
import { allowedRubyLines } from "../src/detectors/ruby/parse-ruby-requirement.js";

test("a bounded requirement lists the release lines it allows", () => {
  assert.deepEqual(allowedRubyLines([">= 2.5.0", "< 2.7.0"]), ["2.5", "2.6"]);
  assert.deepEqual(allowedRubyLines([">= 2.5.0", "< 3.2.0"]), ["2.5", "2.6", "2.7", "3.0", "3.1"]);
  assert.deepEqual(allowedRubyLines(["~> 2.5"]), ["2.5", "2.6", "2.7"]);
  assert.deepEqual(allowedRubyLines(["~> 2.5.1"]), ["2.5"]);
  assert.deepEqual(allowedRubyLines(["2.6.3"]), ["2.6"]);
  assert.deepEqual(allowedRubyLines(["<= 2.6"]), ["2.0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6"]);
});

test("an unbounded or unreadable requirement lists nothing", () => {
  for (const requirement of [[">= 2.5.0"], ["!= 2.5.0"], ["> 3"], ["latest"], ["~> x"], []]) {
    assert.equal(allowedRubyLines(requirement), undefined, requirement.join(","));
  }
});

test("the Gemfile parser reads a ruby directive with several requirement strings", () => {
  assert.deepEqual(parseGemfile("source 'x'\nruby '>= 2.5.0', '< 2.7.0'\n"), [
    { kind: "ruby", value: ">= 2.5.0, < 2.7.0", line: 2 },
  ]);
  assert.deepEqual(parseGemfile("ruby '3.1.4'\n"), [{ kind: "ruby", value: "3.1.4", line: 1 }]);
  assert.deepEqual(parseGemfile("ruby '3.1.4', engine: 'jruby'\nruby File.read('.ruby-version')\n"), []);
});
