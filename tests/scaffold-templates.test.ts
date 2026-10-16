import assert from "node:assert/strict";
import { test } from "node:test";

import { renderScaffold, scaffoldNames } from "../tools/scaffold/index.js";

const samples = [scaffoldNames("go-modules", "go"), scaffoldNames("a"), scaffoldNames("x1-y2-z3"), scaffoldNames("container-images")];

test("every template renders with sample input and substitutes every name", () => {
  for (const names of samples) {
    const files = renderScaffold(names);
    assert.equal(files.size, 9, names.id);
    for (const [path, contents] of files) {
      assert.ok(contents.length > 0, path);
      assert.ok(!/\{\{\s*\w+\s*\}\}|\$\{names\.|\bundefined\b|\[object /.test(contents), `${path}: unrendered placeholder`);
      assert.ok([names.id, names.ecosystem, names.camel, names.pascal].some((name) => contents.includes(name)), `${path} should mention the detector`);
    }
    assert.match(files.get(`src/detectors/${names.id}.ts`)!, new RegExp(`export const ${names.camel}Detector = defineDetector`));
    assert.match(files.get(`src/detectors/${names.id}/parse.ts`)!, new RegExp(`export function parse${names.pascal}\\(contents: string\\): ${names.pascal}Declaration\\[\\]`));
    assert.match(files.get(`tests/${names.id}-parse.test.ts`)!, new RegExp(`import \\{ MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, parse${names.pascal} \\} from "../src/detectors/${names.id}/parse.js"`));
    assert.match(files.get(`docs/detectors/${names.id}.md`)!, new RegExp(`^# ${names.title} detector\\n`));
  }
});

test("generated files follow the repository's conventions", () => {
  for (const names of samples) {
    for (const [path, contents] of renderScaffold(names)) {
      assert.ok(contents.endsWith("\n") && !contents.endsWith("\n\n"), `${path}: exactly one final newline`);
      assert.ok(!contents.includes("\t"), `${path}: no tabs`);
      assert.ok(!/[ \t]+$/m.test(contents), `${path}: no trailing whitespace`);
      assert.ok(!contents.includes("\r"), `${path}: LF line endings`);
      if (!path.endsWith(".ts")) continue;
      for (const line of contents.split("\n")) {
        const indent = /^ */.exec(line)![0].length;
        assert.ok(indent % 2 === 0 || line.trimStart().startsWith("*"), `${path}: two-space indentation in "${line}"`);
      }
      for (const specifier of contents.matchAll(/from "(\.[^"]+)"/g)) {
        assert.match(specifier[1]!, /\.js$/, `${path}: relative import "${specifier[1]}" must end in .js (ESM)`);
      }
      for (const specifier of contents.matchAll(/from "((?:fs|path|os|child_process|http|https|net|crypto)(?:\/[^"]*)?)"/g)) {
        assert.fail(`${path}: import "${specifier[1]}" must use the node: prefix`);
      }
      assert.ok(!/\bany\b|@ts-ignore|eslint-disable/.test(contents), `${path}: no escape hatches`);
    }
  }
});

test("the detector and parser templates keep the safety rules of the repository in code and comments", () => {
  const files = renderScaffold(scaffoldNames("go-modules", "go"));
  const detector = files.get("src/detectors/go-modules.ts")!;
  const parser = files.get("src/detectors/go-modules/parse.ts")!;
  for (const text of [detector, parser]) assert.doesNotMatch(text, /node:(?:https?|net|child_process)|fetch\(|eval\(|new Function/, "no network, processes, or evaluation");
  assert.match(detector, /deterministic/);
  assert.match(detector, /untrusted/);
  assert.match(parser, /pure/);
  assert.match(parser, /never evaluates/);
  assert.match(parser, /MAXIMUM_INPUT_BYTES = 1024 \* 1024/);
  assert.match(parser, /1-based line/);
  assert.doesNotMatch(parser, /readFile|writeFile|Date\.now|new Date|Math\.random/, "the parser has no I/O, clock, or randomness");
});

test("rendering is deterministic", () => {
  for (const names of samples) assert.deepEqual([...renderScaffold(names)], [...renderScaffold(names)]);
});
