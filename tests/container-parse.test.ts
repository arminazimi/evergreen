import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseDockerfile,
} from "../src/detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../src/detectors/container/parse-image.js";

async function fixture(caseName: string, file: string): Promise<string> {
  return readFile(resolve("tests/fixtures/container", caseName, file), "utf8");
}

test("parses FROM lines with stage names, platforms, and qualified references", async () => {
  assert.deepEqual(parseDockerfile(await fixture("positive", "Dockerfile")), [
    { kind: "image", value: "node:16", line: 2 },
    { kind: "image", value: "node:16-alpine", line: 5 },
    { kind: "image", value: "docker.io/library/python:3.8-slim", line: 8 },
  ]);
  assert.deepEqual(parseDockerfile(await fixture("positive", "api.Dockerfile")), [
    { kind: "image", value: "postgres:11.5-bullseye", line: 1 },
  ]);
  assert.equal(parseDockerfile(await fixture("positive", "Containerfile"))[0]?.value.startsWith("redis:5@sha256:"), true);
});

test("reports dynamic references and skips comments, scratch, stages, and RUN strings", async () => {
  assert.deepEqual(parseDockerfile(await fixture("negative", "Dockerfile")), [
    { kind: "dynamic", value: "node:${NODE_VERSION}", line: 2 },
    { kind: "dynamic", value: "$BASE_IMAGE", line: 3 },
    { kind: "image", value: "node:latest", line: 4 },
    { kind: "image", value: "node", line: 5 },
    { kind: "image", value: "node@sha256:0000000000000000000000000000000000000000000000000000000000000000", line: 6 },
    { kind: "image", value: "node:24", line: 8 },
  ]);
  assert.deepEqual(parseDockerfile(await fixture("zero", "Dockerfile")), [
    { kind: "image", value: "node:24-alpine", line: 1 },
  ]);
});

test("malformed input returns nothing and never throws", async () => {
  const malformed = await fixture("malformed", "Dockerfile");
  assert.doesNotThrow(() => parseDockerfile(malformed));
  assert.deepEqual(parseDockerfile(malformed), []);
  for (const junk of ["\u0000\u0001", "﻿", "FROM", "FROM \\", "FROM --platform=", "\r\n\r\n"]) {
    assert.doesNotThrow(() => parseDockerfile(junk));
    assert.deepEqual(parseDockerfile(junk), []);
  }
});

test("bounds untrusted input without affecting adjacent declarations", () => {
  assert.deepEqual(parseDockerfile("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseDockerfile(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\nFROM node:16\n`), [
    { kind: "image", value: "node:16", line: 2 },
  ]);
});

test("handles CRLF, lowercase instructions, and continuations with 1-based lines", () => {
  assert.deepEqual(parseDockerfile("# c\r\nfrom --platform=linux/arm64 \\\r\n  node:18 as x\r\n"), [
    { kind: "image", value: "node:18", line: 2 },
  ]);
});

test("parses image references into registry, repository, tag, and digest", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  assert.deepEqual(parseImageReference("node"), { registry: "docker.io", repository: "library/node" });
  assert.deepEqual(parseImageReference("docker.io/library/node:16"), {
    registry: "docker.io",
    repository: "library/node",
    tag: "16",
  });
  assert.deepEqual(parseImageReference(`ghcr.io/org/app:1.2@${digest}`), {
    registry: "ghcr.io",
    repository: "org/app",
    tag: "1.2",
    digest,
  });
  assert.deepEqual(parseImageReference("localhost:5000/app:2"), {
    registry: "localhost:5000",
    repository: "app",
    tag: "2",
  });
  for (const bad of ["", "RUN", "node:", "node@sha256:abc", "node:${V}", "a//b", "-x"]) {
    assert.equal(parseImageReference(bad), undefined, bad);
  }
});

import { parseCompose } from "../src/detectors/container/parse-compose.js";

test("parses services.*.image with exact lines", async () => {
  assert.deepEqual(parseCompose(await fixture("positive", "compose.yaml")), [
    { kind: "image", value: "postgres:11", line: 3 },
    { kind: "image", value: "redis:5-alpine", line: 5 },
  ]);
  assert.deepEqual(parseCompose(await fixture("positive", "docker-compose.yml")), [
    { kind: "image", value: "docker.io/library/node:16-alpine", line: 3 },
  ]);
});

test("compose ignores lookalike keys and reports interpolation as dynamic", async () => {
  assert.deepEqual(parseCompose(await fixture("negative", "compose.yaml")), [
    { kind: "dynamic", value: "${APP_IMAGE}", line: 3 },
    { kind: "image", value: "node:latest", line: 8 },
    { kind: "image", value: "node:24", line: 10 },
  ]);
  assert.deepEqual(parseCompose(await fixture("zero", "compose.yaml")), []);
});

test("compose skips services built from local Dockerfiles", () => {
  const compose = [
    "services:",
    "  web:",
    "    build: .",
    "    image: node:16",
    "  api:",
    "    build:",
    "      context: ./api",
    "      dockerfile: Dockerfile",
    "    image: node:18",
    "  db:",
    "    image: postgres:11",
    "  worker:",
    "    build: null",
    "    image: redis:6",
  ].join("\n");
  assert.deepEqual(parseCompose(compose), [
    { kind: "image", value: "postgres:11", line: 11 },
    { kind: "image", value: "redis:6", line: 14 },
  ]);
});

test("compose malformed input returns nothing and never throws", async () => {
  const malformed = await fixture("malformed", "compose.yaml");
  assert.doesNotThrow(() => parseCompose(malformed));
  assert.deepEqual(parseCompose(malformed), []);
  for (const junk of ["", "\u0000", "- a\n- b\n", "services: 5\n", "services:\n  a: 1\n", "a: &x 1\nb: *x\n", "{{{"]) {
    assert.doesNotThrow(() => parseCompose(junk));
    assert.deepEqual(parseCompose(junk), []);
  }
  assert.deepEqual(parseCompose("services:\n  a:\n    image: &i node:16\n  b:\n    image: *i\n"), []);
});

test("compose bounds untrusted input", () => {
  assert.deepEqual(parseCompose(`services:\n  a:\n    image: node:16\n#${"x".repeat(1024 * 1024)}`), []);
});
