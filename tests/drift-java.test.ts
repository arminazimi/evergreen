import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";

import { analyzeDrift } from "../src/drift/index.js";
import { javaCollector } from "../src/drift/java.js";
import { runCli } from "./cli-runner.js";

const execute = promisify(execFile);

const tempDirs: string[] = [];

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-drift-java-"));
  tempDirs.push(dir);
  return dir;
}

async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  for (const [path, contents] of Object.entries(files)) {
    const target = join(dir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return dir;
}

function has(
  pins: Awaited<ReturnType<typeof javaCollector.collect>>,
  source: string,
  raw: string,
  release: string,
): boolean {
  return pins.some((pin) => pin.source === source && pin.raw === raw && pin.release === release);
}

test("collects every Java source at the major release", async () => {
  const repo = await makeRepo({
    "pom.xml": `<?xml version="1.0"?>
<project>
  <properties>
    <maven.compiler.release>17</maven.compiler.release>
  </properties>
  <build>
    <plugins>
      <plugin>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <release>21</release>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`,
    "build.gradle": `plugins { id 'java' }
java {
    toolchain { languageVersion = JavaLanguageVersion.of(21) }
    sourceCompatibility = JavaVersion.VERSION_17
}
`,
    "build.gradle.kts": `java {
    toolchain { languageVersion.set(JavaLanguageVersion.of(21)) }
}
`,
    ".java-version": "1.8\n",
    ".sdkmanrc": "java=21.0.1-tem\n",
    ".tool-versions": "nodejs 20.11.0\njava 17.0.2\n",
    Dockerfile: `FROM eclipse-temurin:17 AS build
FROM maven:3.9.9-eclipse-temurin-21 AS deps
FROM gradle:8.10-jdk17
FROM amazoncorretto:8
FROM openjdk:17-slim
`,
    ".github/workflows/ci.yml": `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
`,
    ".gitlab-ci.yml": `image: maven:3.9-eclipse-temurin-17
build:
  image: eclipse-temurin:21
`,
    ".circleci/config.yml": `version: 2.1
jobs:
  build:
    docker:
      - image: eclipse-temurin:21
`,
  });

  const pins = await javaCollector.collect(repo);

  assert.ok(has(pins, "pom.xml compiler setting", "17", "17"), "maven property");
  assert.ok(has(pins, "pom.xml compiler setting", "21", "21"), "maven-compiler-plugin configuration");
  assert.ok(has(pins, "build.gradle toolchain", "21", "21"), "gradle toolchain");
  assert.ok(has(pins, "build.gradle compatibility", "17", "17"), "gradle compatibility");
  assert.ok(has(pins, "build.gradle.kts toolchain", "21", "21"), "kotlin gradle toolchain");
  assert.ok(has(pins, ".java-version", "1.8", "8"), "1.8 normalizes to 8");
  assert.ok(has(pins, ".sdkmanrc java", "21.0.1-tem", "21"), "sdkmanrc");
  assert.ok(has(pins, ".tool-versions java", "17.0.2", "17"), "tool-versions");
  assert.ok(has(pins, "Dockerfile FROM", "17", "17"), "eclipse-temurin image");
  assert.ok(has(pins, "Dockerfile FROM", "3.9.9-eclipse-temurin-21", "21"), "maven image");
  assert.ok(has(pins, "Dockerfile FROM", "8.10-jdk17", "17"), "gradle image");
  assert.ok(has(pins, "Dockerfile FROM", "8", "8"), "amazoncorretto image");
  assert.ok(has(pins, "Dockerfile FROM", "17-slim", "17"), "openjdk image");
  assert.ok(has(pins, ".github/workflows/ci.yml actions/setup-java java-version", "21", "21"), "setup-java");
  assert.ok(has(pins, ".gitlab-ci.yml image", "3.9-eclipse-temurin-17", "17"), "gitlab image");
  assert.ok(has(pins, ".gitlab-ci.yml image", "21", "21"), "gitlab job image");
  assert.ok(has(pins, ".circleci/config.yml image", "21", "21"), "circleci image");
});

test("a Maven property reference and a Gradle expression are unresolved, not guessed", async () => {
  const repo = await makeRepo({
    "pom.xml": `<?xml version="1.0"?>
<project>
  <properties>
    <maven.compiler.release>\${java.version}</maven.compiler.release>
  </properties>
</project>
`,
    "build.gradle": `java {
    sourceCompatibility = JavaVersion.toVersion(libs.versions.java.get())
}
`,
  });

  const pins = await javaCollector.collect(repo);
  const property = pins.find((pin) => pin.raw === "${java.version}");
  assert.equal(property?.release, undefined);
  assert.match(property?.unresolved ?? "", /property reference/);
  const gradle = pins.find((pin) => pin.source === "build.gradle compatibility");
  assert.equal(gradle?.release, undefined);
  assert.match(gradle?.unresolved ?? "", /Gradle expression/);
});

test("a multi-module build with one module out of line is drifted", async () => {
  const report = await analyzeDrift(resolve("tests/fixtures/drift/java/multi-module"), [javaCollector]);
  const runtime = report.runtimes[0];
  assert.equal(runtime?.drifted, true);
  assert.deepEqual(runtime?.releases, ["17", "21"]);
  assert.deepEqual(
    runtime?.pins.map((pin) => pin.path),
    ["module-a/pom.xml", "module-b/pom.xml", "pom.xml"],
  );
});

test("the text report names every pin and the drift", async () => {
  const outcome = await runCli(["drift", "."], { cwd: resolve("tests/fixtures/drift/java/drifted") });
  assert.equal(outcome.code, 0);
  assert.match(outcome.stdout, /\.java-version:1/);
  assert.match(outcome.stdout, /pom\.xml:5/);
  assert.match(outcome.stdout, /releases: 17, 21[\s\S]*DRIFT/);
});

test("--json validates against schemas/drift.v1.schema.json", async () => {
  const outcome = await runCli(["drift", ".", "--json"], { cwd: resolve("tests/fixtures/drift/java/drifted") });
  assert.equal(outcome.code, 0);
  const schema = JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(JSON.parse(outcome.stdout)), true, JSON.stringify(validate.errors));
});

test("--check exits 1 for a drifted repository and 0 for a consistent one", async () => {
  const drifted = await runCli(["drift", ".", "--check"], { cwd: resolve("tests/fixtures/drift/java/drifted") });
  assert.equal(drifted.code, 1);
  const consistent = await runCli(["drift", ".", "--check"], { cwd: resolve("tests/fixtures/drift/java/consistent") });
  assert.equal(consistent.code, 0);
});

test("--align prints a patch that applies and removes the drift", async () => {
  const parent = await makeTempDir();
  const repo = join(parent, "repo");
  await cp(resolve("tests/fixtures/drift/java/drifted"), repo, { recursive: true });
  await execute("git", ["init", "-q"], { cwd: repo });

  const aligned = await runCli(["drift", ".", "--runtime", "java", "--align", "21"], { cwd: repo });
  assert.equal(aligned.code, 0, aligned.stderr);
  assert.match(aligned.stdout, /--- a\/Dockerfile/);
  assert.match(aligned.stdout, /--- a\/pom\.xml/);
  assert.match(aligned.stdout, /\+FROM eclipse-temurin:21/);
  assert.match(aligned.stdout, /<maven.compiler.release>21</);

  await writeFile(join(repo, "patch.diff"), aligned.stdout);
  await execute("git", ["apply", "--check", "patch.diff"], { cwd: repo });
  await execute("git", ["apply", "patch.diff"], { cwd: repo });

  const check = await runCli(["drift", ".", "--check"], { cwd: repo });
  assert.equal(check.code, 0, check.stdout + check.stderr);
});

test("--align refuses expressions and floating values and never writes a file", async () => {
  const repo = resolve("tests/fixtures/drift/java/unresolved");
  const aligned = await runCli(["drift", ".", "--runtime", "java", "--align", "21"], { cwd: repo });
  assert.equal(aligned.code, 0);
  assert.equal(aligned.stdout, "");
  assert.match(aligned.stderr, /Refused pom\.xml:5/);
  assert.match(aligned.stderr, /Refused Dockerfile:1/);
  assert.match(aligned.stderr, /Refused build\.gradle:2/);
});

test("bad flags exit 2", async () => {
  const repo = resolve("tests/fixtures/drift/java/consistent");
  assert.equal((await runCli(["drift", ".", "--align", "21"], { cwd: repo })).code, 2, "--align requires --runtime");
  assert.equal((await runCli(["drift", ".", "--bogus"], { cwd: repo })).code, 2, "unknown flag");
  assert.equal((await runCli(["drift", ".", "--runtime", "nope"], { cwd: repo })).code, 2, "unknown runtime");
});
