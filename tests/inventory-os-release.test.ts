import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { parseExport, runInventory } from "../src/inventory/index.js";
import { osReleaseImporter, parseOsReleaseDocument } from "../src/inventory/os-release.js";
import { runCli } from "./cli-runner.js";

const fixtures = resolve("tests/fixtures/inventory");
const osReleaseFixtures = resolve(fixtures, "os-release");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryExport(name: string, contents: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-os-release-"));
  temporaryRoots.push(root);
  const path = join(root, name);
  await writeFile(path, contents);
  return path;
}

async function invokeCli(...args: string[]) {
  return runCli(args);
}

async function fixtureFiles(): Promise<string[]> {
  const names = await readdir(fixtures, { recursive: true });
  return names
    .filter((name) => typeof name === "string" && (name.endsWith(".txt") || name.endsWith(".json")))
    .map((name) => resolve(fixtures, name))
    .sort();
}

function lineValue(text: string, pointer: string): string | undefined {
  const line = /^line:(\d+)$/.exec(pointer);
  if (!line?.[1]) return undefined;
  const source = text.split(/\r?\n/)[Number(line[1]) - 1];
  const match = /^\s*(?:export\s+)?VERSION_ID\s*=\s*(.*?)\s*$/.exec(source ?? "");
  if (!match?.[1]) return undefined;
  const value = match[1];
  const quote = value[0];
  return value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

const distributions: Array<[file: string, purl: string, version: string, pointer: string, rule: string]> = [
  ["ubuntu-20.04.txt", "pkg:generic/ubuntu", "20.04", "line:6", "container.host-ubuntu.eol-22.04-and-older"],
  ["debian-11.txt", "pkg:generic/debian", "11", "line:3", "container.host-debian.eol-11-and-older"],
  ["rhel-7.9.txt", "pkg:generic/rhel", "7.9", "line:5", "container.host-rhel.eol-7-and-older"],
  ["centos-7.txt", "pkg:generic/centos", "7", "line:5", "container.host-centos.eol-8-and-older"],
  ["amzn-2.txt", "pkg:generic/amzn", "2", "line:5", "container.host-amazon-linux.eol-2-and-older"],
  ["alpine-3.16.txt", "pkg:generic/alpine", "3.16.9", "line:3", "container.host-alpine.eol-3.20-and-older"],
  ["sles-15.4.txt", "pkg:generic/sles", "15.4", "line:3", "container.host-sles.eol-15-sp6-and-older"],
];

test("every listed distribution is affected by a rule with a distribution source", async () => {
  for (const [name, purl, version, pointer, rule] of distributions) {
    const file = join(osReleaseFixtures, name);
    const report = await runInventory([file]);
    assert.equal(report.unrecognized.length, 0, name);
    assert.equal(report.results.length, 1, name);
    const { item, check } = report.results[0]!;
    assert.equal(item.resource, name, name);
    assert.equal(item.purl, purl, name);
    assert.equal(item.version, version, name);
    assert.equal(item.pointer, pointer, name);
    assert.equal(check.status, "affected", name);
    assert.equal(check.findings[0]?.ruleId, rule, name);
    const sources = check.findings[0]?.sources ?? [];
    assert.ok(sources.length > 0, name);
    assert.ok(
      sources.every((source) => source.url.startsWith("https://")),
      name,
    );
    assert.ok(!sources.some((source) => /endoflife\.date/.test(source.url)), `${name} cites an aggregator`);
  }
});

test("a bundle reports each host by name, with the line of its own VERSION_ID", async () => {
  const file = join(osReleaseFixtures, "bundle.txt");
  const text = await readFile(file, "utf8");
  const report = await runInventory([file]);
  assert.deepEqual(
    report.results.map(({ item, check }) => [item.resource, item.purl, item.version, item.pointer, check.status]),
    [
      ["edge-1", "pkg:generic/alpine", "3.16.9", "line:14", "affected"],
      ["web-1", "pkg:generic/ubuntu", "20.04", "line:4", "affected"],
      ["db-1", "pkg:generic/debian", "11", "line:9", "affected"],
    ],
  );
  for (const { item } of report.results) assert.equal(lineValue(text, item.pointer), item.version, item.pointer);
});

test("quoted values are read the same as unquoted ones", async () => {
  const file = join(osReleaseFixtures, "quoted.txt");
  const report = await runInventory([file]);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0]!.item.resource, "quoted.txt");
  assert.equal(report.results[0]!.item.version, "20.04");
  assert.equal(report.results[0]!.check.status, "affected");
});

test("every pointer resolves to the version value in every valid fixture", async () => {
  for (const [name] of distributions) {
    const file = join(osReleaseFixtures, name);
    const text = await readFile(file, "utf8");
    for (const { item } of (await runInventory([file])).results) {
      assert.equal(lineValue(text, item.pointer), item.version, `${name} ${item.pointer}`);
    }
  }
});

test("detect recognizes only this importer's valid fixtures", async () => {
  for (const file of await fixtureFiles()) {
    const text = await readFile(file, "utf8");
    const document = parseExport(text);
    const path = relative(fixtures, file).split("\\").join("/");
    const ours = path.startsWith("os-release/") && !path.startsWith("os-release/rejects/");
    assert.equal(osReleaseImporter.detect(document, file), ours, file);
    if (!ours) assert.deepEqual(osReleaseImporter.items(document, file), [], file);
  }
  for (const value of [null, undefined, 0, {}, [], { ID: "ubuntu", VERSION_ID: "20.04" }]) {
    assert.equal(osReleaseImporter.detect(value, "export.json"), false);
  }
});

test("ID_LIKE is read as the family and does not apply the parent's lifecycle", async () => {
  const text = await readFile(join(osReleaseFixtures, "amzn-2.txt"), "utf8");
  const [block] = parseOsReleaseDocument(text);
  assert.equal(block?.values.get("ID_LIKE")?.value, "centos rhel fedora");
  const [item] = osReleaseImporter.items(text, "amzn-2.txt");
  assert.equal(item?.purl, "pkg:generic/amzn");
});

test("a rolling version tag is recognized but not judged", async () => {
  const file = join(osReleaseFixtures, "rolling.txt");
  const text = await readFile(file, "utf8");
  assert.equal(osReleaseImporter.detect(text, file), true);
  assert.deepEqual(osReleaseImporter.items(text, file), []);
  const report = await runInventory([file]);
  assert.deepEqual(report.unrecognized, []);
  assert.deepEqual(report.results, []);
});

test("a supported release is not affected, and a distribution with no rule is no-data", async () => {
  const supported = await temporaryExport("alpine-3.22.txt", 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.22.0\n');
  const unknown = await temporaryExport("fedora-42.txt", 'NAME="Fedora Linux"\nID=fedora\nVERSION_ID=42\n');
  const report = await runInventory([supported, unknown]);
  const statuses = new Map(report.results.map((result) => [result.item.resource, result.check.status]));
  assert.equal(statuses.get("alpine-3.22.txt"), "not-affected");
  assert.equal(statuses.get("fedora-42.txt"), "no-data");
});

test("the command reports an affected bundle, exits 1, and prints each affected host", async () => {
  const file = join(osReleaseFixtures, "bundle.txt");
  const text = await invokeCli("inventory", file);
  assert.equal(text.code, 1);
  assert.match(text.stdout, /web-1 {2}20\.04 {2}affected {2}container\.host-ubuntu\.eol-22\.04-and-older {2}line:4/);
});

test("--json matches inventory.v1.schema.json, and --redact removes every host name", async () => {
  const file = join(osReleaseFixtures, "bundle.txt");
  const plain = await invokeCli("inventory", file, "--json");
  assert.equal(plain.code, 1);
  const report = JSON.parse(plain.stdout);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/check.v1.schema.json"), "utf8")) as object);
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
  const validate = ajv.compile(
    JSON.parse(await readFile(resolve("schemas/inventory.v1.schema.json"), "utf8")) as object,
  );
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.deepEqual(
    report.results.map((result: { item: { resource: string } }) => result.item.resource),
    ["edge-1", "web-1", "db-1"],
  );

  const redacted = await invokeCli("inventory", file, "--json", "--redact");
  assert.equal(redacted.code, 1);
  assert.doesNotMatch(redacted.stdout, /web-1|db-1|edge-1/);
  for (const result of JSON.parse(redacted.stdout).results as Array<{ item: { resource: string } }>) {
    assert.match(result.item.resource, /^[0-9a-f]{12}$/);
  }
});

test("--format selects the importer and --fail-on sets the gate", async () => {
  const file = join(osReleaseFixtures, "bundle.txt");
  assert.equal((await invokeCli("inventory", file, "--format", "os-release", "--fail-on", "none")).code, 0);
  assert.equal((await invokeCli("inventory", file, "--fail-on", "critical")).code, 0);
  assert.equal((await invokeCli("inventory", file, "--fail-on", "high")).code, 1);
  const unknown = await invokeCli("inventory", file, "--format", "not-an-importer");
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown importer/);
});

test("the shipped example bundle reports at least one affected host and exits 1", async () => {
  const result = await invokeCli("inventory", resolve("examples/inventory/hosts.txt"), "--json");
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.ok(report.results.length >= 1);
  assert.ok(report.results.some((entry: { check: { status: string } }) => entry.check.status === "affected"));
});
