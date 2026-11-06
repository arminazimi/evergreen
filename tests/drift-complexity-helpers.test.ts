import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { setupJavaVersions } from "../src/drift/java.js";
import { align as alignPhp, setupPhpVersions } from "../src/drift/php.js";
import { collectAlignable, collectRootFiles, pythonCollector, setupPythonVersions } from "../src/drift/python.js";
import { align as alignRuby, setupRubyVersions } from "../src/drift/ruby.js";
import type { RuntimePin } from "../src/drift/index.js";

function pin(source: string, raw: string, kind: "pin" | "floor" = "pin"): RuntimePin {
  return { path: "file", line: 1, source, raw, kind };
}

test("collectRootFiles reads every Python root file it claims", () => {
  const pins: RuntimePin[] = [];
  collectRootFiles(pins, ".python-version", "3.11.4\n# a comment\n");
  collectRootFiles(pins, ".tool-versions", "python 3.10.13 3.9.18\nnodejs 20.11.0\n");
  collectRootFiles(pins, "runtime.txt", "python-3.9.18\n");
  collectRootFiles(pins, "Pipfile", '[requires]\npython_version = "3.9"\n');
  collectRootFiles(
    pins,
    "pyproject.toml",
    '[project]\nrequires-python = ">=3.12"\n[tool.poetry.dependencies]\npython = "^3.9"\n',
  );
  collectRootFiles(pins, "setup.cfg", "[options]\npython_requires = >=3.8,<4\n");
  collectRootFiles(pins, "setup.py", 'setup(python_requires=">=3.7")\n');
  collectRootFiles(pins, "README.md", "3.9\n");

  assert.deepEqual(
    pins.map((item) => [item.source, item.line, item.raw, item.kind, item.release]),
    [
      [".python-version", 1, "3.11.4", "pin", "3.11"],
      [".tool-versions", 1, "3.10.13", "pin", "3.10"],
      [".tool-versions", 1, "3.9.18", "pin", "3.9"],
      ["runtime.txt", 1, "python-3.9.18", "pin", "3.9"],
      ["Pipfile requires", 2, "3.9", "pin", "3.9"],
      ["pyproject.toml requires-python", 2, ">=3.12", "floor", "3.12"],
      ["pyproject.toml poetry python", 4, "^3.9", "floor", "3.9"],
      ["setup.cfg python_requires", 2, ">=3.8,<4", "floor", "3.8"],
      ["setup.py python_requires", 1, ">=3.7", "floor", "3.7"],
    ],
  );
  assert.deepEqual(
    pins.filter((item) => item.source === ".python-version").map((item) => item.group),
    [".python-version:.python-version"],
  );
});

test("collectRootFiles ignores a root file it does not read", () => {
  const pins: RuntimePin[] = [];
  collectRootFiles(pins, "requirements.txt", "python-3.9\n");
  assert.deepEqual(pins, []);
});

const PYTHON_WORKFLOW = `jobs:
  build:
    strategy:
      matrix:
        python: ['3.9', '3.10']
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python }}
  other:
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: 3.12
      - uses: actions/checkout@v4
        with:
          python-version: 3.8
      - uses: actions/setup-python@v5
        with:
          python-version: \${{ inputs.python }}
`;

test("setupPythonVersions follows a matrix reference and flags other expressions", () => {
  assert.deepEqual(setupPythonVersions(PYTHON_WORKFLOW), [
    { value: "3.9", line: 5, matrix: true, group: "matrix:python@5" },
    { value: "3.10", line: 5, matrix: true, group: "matrix:python@5" },
    { value: "3.12", line: 14, matrix: false },
    { value: "${{ inputs.python }}", line: 20, matrix: false },
  ]);
});

test("setupPythonVersions returns nothing for invalid or job-less YAML", () => {
  assert.deepEqual(setupPythonVersions("jobs: [\n"), []);
  assert.deepEqual(setupPythonVersions("name: x\n"), []);
});

test("collectAlignable rewrites each Python source it understands", () => {
  assert.equal(collectAlignable(pin(".python-version", "3.10.13"), "3.10.13", "3.12"), "3.12");
  assert.equal(collectAlignable(pin(".python-version", "python-3.10"), "python-3.10", "3.12"), "python-3.12");
  assert.equal(collectAlignable(pin(".python-version", "main"), "main", "3.12"), undefined);
  assert.equal(
    collectAlignable(pin(".tool-versions", "3.10.13"), "python 3.10.13  # pinned", "3.12"),
    "python 3.12  # pinned",
  );
  assert.equal(collectAlignable(pin(".tool-versions", "3.10.13"), "python 3.10.13 3.9", "3.12"), undefined);
  assert.equal(collectAlignable(pin("runtime.txt", "python-3.9.18"), "python-3.9.18", "3.12"), "python-3.12");
  assert.equal(
    collectAlignable(pin("Pipfile requires", "3.9"), 'python_version = "3.9"', "3.12"),
    'python_version = "3.12"',
  );
  assert.equal(
    collectAlignable(pin("Dockerfile FROM", "3.11-slim"), "FROM python:3.11-slim", "3.12"),
    "FROM python:3.12-slim",
  );
  assert.equal(collectAlignable(pin("Dockerfile FROM", "3.11-slim"), "FROM node:20-slim", "3.12"), undefined);
  assert.equal(
    collectAlignable(pin("setup-python python-version", "3.11"), "python-version: '3.11'", "3.12"),
    "python-version: '3.12'",
  );
  assert.equal(collectAlignable(pin("unknown source", "3.11"), "3.11", "3.12"), undefined);
});

test("pythonCollector.collect dispatches every file kind it claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-python-dispatch-"));
  try {
    const files: Record<string, string> = {
      ".python-version": "3.11.4\n",
      Dockerfile: "FROM python:3.10-slim\n",
      ".gitlab-ci.yml": "image: python:3.9-slim\n",
      ".circleci/config.yml": "jobs:\n  build:\n    docker:\n      - image: cimg/python:3.11\n",
      "azure-pipelines.yml": "container: python:3.10\n",
      "environment.yml": "dependencies:\n  - python=3.9\n",
      ".github/workflows/ci.yml":
        "jobs:\n  build:\n    steps:\n      - uses: actions/setup-python@v5\n        with:\n          python-version: 3.12\n",
      "notes.txt": "python 3.9\n",
    };
    for (const [path, contents] of Object.entries(files)) {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    const pins = await pythonCollector.collect(root);
    assert.deepEqual(
      [...new Set(pins.map((item) => item.source))].sort(),
      [
        ".python-version",
        "Azure Pipelines image",
        "CircleCI image",
        "Dockerfile FROM",
        "GitLab CI image",
        "conda environment.yml",
        "setup-python python-version",
      ].sort(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("setupJavaVersions follows a matrix reference and keeps direct values direct", () => {
  const workflow = `jobs:
  build:
    strategy:
      matrix:
        java: [17, '21']
    steps:
      - uses: actions/setup-java@v4
        with:
          java-version: \${{ matrix.java }}
  other:
    steps:
      - uses: actions/setup-java@v4
        with:
          java-version: 11
`;
  assert.deepEqual(setupJavaVersions(workflow), [
    { value: "17", line: 5, direct: false, group: "matrix:java@5" },
    { value: "21", line: 5, direct: false, group: "matrix:java@5" },
    { value: "11", line: 14, direct: true },
  ]);
  assert.deepEqual(setupJavaVersions("jobs: [\n"), []);
  assert.deepEqual(setupJavaVersions("name: x\n"), []);
});

test("setupJavaVersions reads a single matrix value rather than only lists", () => {
  const workflow = `jobs:
  build:
    strategy:
      matrix:
        java: 17
    steps:
      - uses: actions/setup-java@v4
        with:
          java-version: \${{ matrix.java }}
`;
  assert.deepEqual(setupJavaVersions(workflow), [{ value: "17", line: 5, direct: false, group: "matrix:java@5" }]);
});

test("setupPhpVersions reports matrix entries, direct pins, and expressions", () => {
  const workflow = `jobs:
  build:
    strategy:
      matrix:
        php: ['8.2', '8.3']
    steps:
      - uses: shivammathur/setup-php@v2
        with:
          php-version: \${{ matrix.php }}
  other:
    steps:
      - uses: shivammathur/setup-php@v2
        with:
          php-version: 8.3
      - uses: shivammathur/setup-php@v2
        with:
          php-version: \${{ inputs.php }}
`;
  assert.deepEqual(setupPhpVersions(workflow), [
    { value: "8.2", line: 5, expression: false, matrix: true },
    { value: "8.3", line: 5, expression: false, matrix: true },
    { value: "8.3", line: 14, expression: false, matrix: false },
    { value: "${{ inputs.php }}", line: 17, expression: true, matrix: false },
  ]);
  assert.deepEqual(setupPhpVersions("jobs: [\n"), []);
  assert.deepEqual(setupPhpVersions("name: x\n"), []);
});

test("alignPhp rewrites each PHP source it understands and refuses floors and digests", () => {
  assert.equal(alignPhp(pin(".php-version", "php-8.2"), "php-8.2\n", "8.3"), "php-8.3");
  assert.equal(alignPhp(pin(".php-version", "8.2"), "8.2\n", "8.3"), "8.3");
  assert.equal(alignPhp(pin(".php-version", "8.1"), "8.2\n", "8.3"), undefined);
  assert.equal(alignPhp(pin(".tool-versions", "8.2"), "php 8.2 # pinned", "8.3"), "php 8.3 # pinned");
  assert.equal(alignPhp(pin(".tool-versions", "8.1"), "php 8.2", "8.3"), undefined);
  assert.equal(alignPhp(pin("composer.json config.platform.php", "8.2"), '  "php": "8.2",', "8.3"), '  "php": "8.3",');
  assert.equal(
    alignPhp(pin("Dockerfile FROM", "8.2-fpm"), "FROM php:8.2-fpm AS build", "8.3"),
    "FROM php:8.3-fpm AS build",
  );
  assert.equal(alignPhp(pin("GitLab CI image", "8.2"), "image: php:8.2", "8.3"), "image: php:8.3");
  assert.equal(alignPhp(pin("CircleCI image", "8.2"), "image: cimg/php:8.2", "8.3"), "image: cimg/php:8.3");
  assert.equal(alignPhp(pin("CircleCI image", "8.2"), "image: cimg/php:8.2@sha256:abc", "8.3"), undefined);
  assert.equal(
    alignPhp(pin("GitHub Actions shivammathur/setup-php php-version", "8.2"), "php-version: '8.2'", "8.3"),
    "php-version: '8.3'",
  );
  assert.equal(
    alignPhp(pin("GitHub Actions shivammathur/setup-php php-version", "${{ inputs.php }}"), "x: 1", "8.3"),
    undefined,
  );
  assert.equal(alignPhp(pin("composer.json require.php", "8.2", "floor"), "x", "8.3"), undefined);
  assert.equal(alignPhp(pin(".php-version", "8.2"), "8.2\n", "8"), undefined);
  assert.equal(alignPhp(pin("unknown source", "8.2"), "8.2", "8.3"), undefined);
});

test("setupRubyVersions groups matrix entries and keeps direct values apart", () => {
  const workflow = `jobs:
  build:
    strategy:
      matrix:
        ruby: ['3.2', '3.3']
    steps:
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: \${{ matrix.ruby }}
  other:
    steps:
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: 3.4
`;
  assert.deepEqual(setupRubyVersions(workflow), [
    { value: "3.2", line: 5, expression: false, group: "matrix:ruby@5" },
    { value: "3.3", line: 5, expression: false, group: "matrix:ruby@5" },
    { value: "3.4", line: 14, expression: false },
  ]);
  assert.deepEqual(setupRubyVersions("jobs: [\n"), []);
  assert.deepEqual(setupRubyVersions("name: x\n"), []);
});

test("alignRuby rewrites each Ruby source it understands and refuses floors", () => {
  assert.equal(alignRuby(pin(".ruby-version", "ruby-3.3.0"), "ruby-3.3.0\n", "3.4"), "ruby-3.4");
  assert.equal(alignRuby(pin(".ruby-version", "3.3.0"), "3.3.0\n", "3.4"), "3.4");
  assert.equal(alignRuby(pin(".ruby-version", "3.2.0"), "3.3.0\n", "3.4"), undefined);
  assert.equal(alignRuby(pin(".tool-versions", "3.3.0"), "ruby 3.3.0 # pinned", "3.4"), "ruby 3.4 # pinned");
  assert.equal(alignRuby(pin("Gemfile ruby", "3.3.0"), 'ruby "3.3.0"', "3.4"), 'ruby "3.4"');
  assert.equal(alignRuby(pin("Dockerfile FROM", "3.3.0-slim"), "FROM ruby:3.3.0-slim", "3.4"), "FROM ruby:3.4-slim");
  assert.equal(alignRuby(pin("Dockerfile RUN", "3.3.0"), "RUN rbenv install 3.3.0", "3.4"), "RUN rbenv install 3.4");
  assert.equal(alignRuby(pin("Gemfile.lock RUBY VERSION", "3.3.0p0"), "   ruby 3.3.0p0", "3.4"), undefined);
  assert.equal(
    alignRuby(pin("GitHub Actions ruby/setup-ruby ruby-version", "3.3"), "ruby-version: '3.3'", "3.4"),
    "ruby-version: '3.4'",
  );
  assert.equal(
    alignRuby(pin("GitHub Actions ruby/setup-ruby ruby-version", "${{ inputs.ruby }}"), "x: 1", "3.4"),
    undefined,
  );
  assert.equal(alignRuby(pin("gemspec required_ruby_version", "3.2", "floor"), "x", "3.4"), undefined);
});
