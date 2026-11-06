import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDevcontainer } from "../src/detectors/container/parse-devcontainer.js";
import { parseImageReference } from "../src/detectors/container/parse-image.js";

test("devcontainer: line and block comments are stripped and line numbers are kept", () => {
  const contents = [
    "{",
    "  // the base image",
    "  /* multi",
    "     line */",
    '  "image": "node:16", // trailing',
    "}",
  ].join("\n");
  assert.deepEqual(parseDevcontainer(contents), [{ kind: "image", value: "node:16", line: 5 }]);
});

test("devcontainer: comment markers inside strings and escaped quotes are preserved", () => {
  const contents = '{ "name": "a // b /* c */ \\" still string", "image": "ghcr.io/org/app:1" }';
  assert.deepEqual(parseDevcontainer(contents), [{ kind: "image", value: "ghcr.io/org/app:1", line: 1 }]);
});

test("devcontainer: trailing commas are tolerated and unterminated comments yield no declaration", () => {
  assert.deepEqual(parseDevcontainer('{ "image": "node:16", }'), [{ kind: "image", value: "node:16", line: 1 }]);
  assert.deepEqual(parseDevcontainer('{ "image": "node:16" } /* never closed'), [
    { kind: "image", value: "node:16", line: 1 },
  ]);
  assert.deepEqual(parseDevcontainer('{ "image": "node:16" // c'), []);
  assert.deepEqual(parseDevcontainer("// only a comment"), []);
});

test("parseImageReference: registry, tag and digest corners", () => {
  const digest = `sha256:${"b".repeat(64)}`;
  assert.deepEqual(parseImageReference(`app@${digest}`), {
    registry: "docker.io",
    repository: "library/app",
    digest,
  });
  assert.deepEqual(parseImageReference("index.docker.io/org/app:3"), {
    registry: "docker.io",
    repository: "org/app",
    tag: "3",
  });
  assert.deepEqual(parseImageReference("Registry.Example.com/team/app"), {
    registry: "registry.example.com",
    repository: "team/app",
  });
  assert.equal(parseImageReference("app:bad tag"), undefined);
  assert.equal(parseImageReference(`app@${digest}x`), undefined);
  assert.equal(parseImageReference("x".repeat(513)), undefined);
});
