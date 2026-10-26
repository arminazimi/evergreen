import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { gzipSync } from "node:zlib";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { containerDetector } from "../src/detectors/container/index.js";
import {
  findRootfsSnapshots,
  parseGoVersion,
  parseJavaRelease,
  parseNodeVersionHeader,
  parseOsRelease,
  readRootfs,
} from "../src/detectors/container/rootfs.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/container-rootfs");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-container-rootfs-"));
  temporaryRoots.push(root);
  return root;
}

async function expected(ruleId: string, path: string, line: number, subject: string): Promise<DetectorFinding> {
  for (const file of ["container", "dotnet", "nodejs", "python", "ruby", "php", "java", "go"]) {
    const rules = validateRegistryV2(JSON.parse(await readFile(`registry/${file}.json`, "utf8"))).rules;
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) continue;
    return {
      id: `${ruleId}:${path}:${line}`,
      ruleId,
      title: rule.title,
      summary: `${subject}. ${rule.summary}`,
      severity: rule.severity,
      location: { path, line },
      ...(rule.replacement ? { replacement: rule.replacement } : {}),
      ...(rule.deadline ? { deadline: rule.deadline } : {}),
      ...(rule.migration ? { migration: rule.migration } : {}),
      sources: rule.sources,
    };
  }
  throw new Error(`No registry rule ${ruleId}`);
}

async function rootfsFindings(prefix = ""): Promise<DetectorFinding[]> {
  const location = (path: string): string => `${prefix}${path}`;
  return Promise.all([
    expected("container.debian.eol-11-and-older", location("etc/os-release"), 3, `${location("etc/os-release")} reports Debian GNU/Linux 11 (bullseye)`),
    expected("dotnet.runtime.end-of-support-6.0", location("usr/share/dotnet/shared/Microsoft.NETCore.App/6.0.21"), 1, `${location("usr/share/dotnet/shared/Microsoft.NETCore.App/6.0.21")} ships dotnet 6.0.21`),
    expected("go.runtime.end-of-support-1.20-and-older", location("usr/local/go/VERSION"), 1, `${location("usr/local/go/VERSION")} ships golang 1.20.14`),
    expected("java.jdk.end-of-support-12-16", location("usr/lib/jvm/java-13-openjdk-amd64/release"), 2, `${location("usr/lib/jvm/java-13-openjdk-amd64/release")} ships java 13.0.14`),
    expected("nodejs.runtime.legacy", location("usr/local/include/node/node_version.h"), 1, `${location("usr/local/include/node/node_version.h")} ships nodejs 16.20.2`),
    expected("php.runtime.eol-8.1", location("usr/bin/php8.1"), 1, `${location("usr/bin/php8.1")} ships php 8.1`),
    expected("python.runtime.eol-3.9-and-older", location("usr/local/lib/python3.9"), 1, `${location("usr/local/lib/python3.9")} ships python 3.9`),
    expected("ruby.runtime.eol-3.1", location("usr/local/lib/ruby/3.1.0"), 1, `${location("usr/local/lib/ruby/3.1.0")} ships ruby 3.1.0`),
  ]);
}

async function fixtureFiles(directory: string = fixtures, prefix = ""): Promise<Array<{ path: string; contents: Buffer }>> {
  const files: Array<{ path: string; contents: Buffer }> = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === "README.md") continue;
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...(await fixtureFiles(join(directory, entry.name), `${path}/`)));
    else if (entry.isFile()) files.push({ path, contents: await readFile(join(directory, entry.name)) });
  }
  return files;
}

function tarHeader(path: string, size: number, type: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, "utf8");
  header.write("0000644\0", 100, "ascii");
  header.write("0000000\0", 108, "ascii");
  header.write("0000000\0", 116, "ascii");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  header.write("00000000000\0", 136, "ascii");
  header.write("        ", 148, "ascii");
  header.write(type, 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  return header;
}

function tar(files: Array<{ path: string; contents: Buffer }>, prefix = ""): Buffer {
  const blocks: Buffer[] = [];
  for (const file of files) {
    blocks.push(tarHeader(`${prefix}${file.path}`, file.contents.length, "0"));
    const data = Buffer.alloc(Math.ceil(file.contents.length / 512) * 512);
    file.contents.copy(data);
    blocks.push(data);
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

test("reads the OS and every well-known runtime from an unpacked root filesystem", async () => {
  const snapshot = await readRootfs(fixtures);
  assert.ok(snapshot);
  assert.equal(snapshot.label, "");
  assert.deepEqual(snapshot.osRelease, {
    entry: "etc/os-release",
    path: "etc/os-release",
    line: 3,
    id: "debian",
    versionId: "11",
    codename: "bullseye",
    prettyName: "Debian GNU/Linux 11 (bullseye)",
  });
  assert.deepEqual(
    snapshot.runtimes.map((evidence) => [evidence.runtime, evidence.version, evidence.path, evidence.line]),
    [
      ["dotnet", "6.0.21", "usr/share/dotnet/shared/Microsoft.NETCore.App/6.0.21", 1],
      ["golang", "1.20.14", "usr/local/go/VERSION", 1],
      ["java", "13.0.14", "usr/lib/jvm/java-13-openjdk-amd64/release", 2],
      ["nodejs", "16.20.2", "usr/local/include/node/node_version.h", 1],
      ["php", "8.1", "usr/bin/php8.1", 1],
      ["python", "3.12", "usr/local/lib/python3.12", 1],
      ["python", "3.9", "usr/local/lib/python3.9", 1],
      ["ruby", "3.1.0", "usr/local/lib/ruby/3.1.0", 1],
    ],
  );
});

test("the detector reports OS and runtime findings for the rootfs fixture", async () => {
  const analysis = await containerDetector.analyze({ root: fixtures });
  assert.deepEqual(analysis.findings, await rootfsFindings());
  assert.deepEqual(analysis.unclassified, []);
});

test("container passes detector conformance on the rootfs fixture", async () => {
  await runDetectorConformance({
    detector: containerDetector,
    fixtures: [{ name: "container rootfs", root: fixtures, expectedFindings: await rootfsFindings() }],
    checks: [determinismCheck, evidenceCheck],
  });
});

test("a rootfs tar archive is read without unpacking it", async () => {
  const root = await temporaryDirectory();
  await writeFile(join(root, "image.tar"), tar(await fixtureFiles()));
  const analysis = await containerDetector.analyze({ root });
  assert.deepEqual(analysis.findings, await rootfsFindings("image.tar!"));
});

test("a gzip-compressed rootfs archive is read without unpacking it", async () => {
  const root = await temporaryDirectory();
  await writeFile(join(root, "image.tgz"), gzipSync(tar(await fixtureFiles())));
  const analysis = await containerDetector.analyze({ root });
  assert.deepEqual(analysis.findings, await rootfsFindings("image.tgz!"));
});

test("a rootfs archive with one top-level directory is read from that directory", async () => {
  const root = await temporaryDirectory();
  await writeFile(join(root, "rootfs.tar"), tar(await fixtureFiles(), "rootfs/"));
  const snapshot = await readRootfs(join(root, "rootfs.tar"));
  assert.equal(snapshot?.osRelease?.path, "rootfs.tar!etc/os-release");
  assert.deepEqual((await containerDetector.analyze({ root })).findings, await rootfsFindings("rootfs.tar!"));
});

test("members written with a ./ prefix, as tar -C writes them, are read", async () => {
  const root = await temporaryDirectory();
  await writeFile(join(root, "image.tar"), tar(await fixtureFiles(), "./"));
  assert.deepEqual((await containerDetector.analyze({ root })).findings, await rootfsFindings("image.tar!"));
});

test("an archive without os-release, an empty directory, and malformed data are not root filesystems", async () => {
  const root = await temporaryDirectory();
  await writeFile(join(root, "source.tar"), tar([{ path: "README.md", contents: Buffer.from("hello\n") }]));
  assert.deepEqual(await findRootfsSnapshots(root), []);
  assert.equal(await readRootfs(root), undefined);
  assert.equal(await readRootfs(join(root, "missing")), undefined);

  const truncated = tar(await fixtureFiles()).subarray(0, 700);
  await writeFile(join(root, "broken.tar"), truncated);
  const broken = await readRootfs(join(root, "broken.tar"));
  assert.ok(broken === undefined || broken.runtimes.length === 0);
});

test("a malformed gzip archive is skipped without throwing", async () => {
  const root = await temporaryDirectory();
  await writeFile(join(root, "image.tar.gz"), Buffer.from("not a gzip stream"));
  assert.deepEqual(await findRootfsSnapshots(root), []);
  assert.equal(await readRootfs(join(root, "image.tar.gz")), undefined);
});

test("Ruby is reported once when a versioned binary and a library directory both ship", async () => {
  const root = await temporaryDirectory();
  await mkdir(join(root, "etc"), { recursive: true });
  await mkdir(join(root, "usr/bin"), { recursive: true });
  await mkdir(join(root, "usr/lib/ruby/3.1.0"), { recursive: true });
  await writeFile(join(root, "etc/os-release"), 'ID=debian\nVERSION_ID="12"\n');
  await writeFile(join(root, "usr/bin/ruby3.1"), "");
  await writeFile(join(root, "usr/lib/ruby/3.1.0/placeholder"), "");

  const analysis = await containerDetector.analyze({ root });
  assert.deepEqual(
    analysis.findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]),
    [["ruby.runtime.eol-3.1", "usr/bin/ruby3.1", 1]],
  );
});

test("an absolute os-release symlink that leaves the rootfs is not followed", async (t) => {
  const root = await temporaryDirectory();
  const outside = await temporaryDirectory();
  const hostFile = join(outside, "os-release");
  await writeFile(hostFile, 'ID=debian\nVERSION_ID="11"\n');
  await mkdir(join(root, "etc"), { recursive: true });
  try {
    await symlink(hostFile, join(root, "etc/os-release"));
  } catch {
    t.skip("symbolic links are not available");
    return;
  }
  assert.equal(await readRootfs(root), undefined);
});

test("a relative os-release symlink inside the rootfs is followed", async (t) => {
  const root = await temporaryDirectory();
  await mkdir(join(root, "etc"), { recursive: true });
  await mkdir(join(root, "usr/lib"), { recursive: true });
  await writeFile(join(root, "usr/lib/os-release"), 'ID=debian\nVERSION_ID="11"\n');
  try {
    await symlink("../usr/lib/os-release", join(root, "etc/os-release"));
  } catch {
    t.skip("symbolic links are not available");
    return;
  }
  const snapshot = await readRootfs(root);
  assert.equal(snapshot?.osRelease?.path, "etc/os-release");
  assert.equal(snapshot?.osRelease?.versionId, "11");
});

test("a symlinked runtime directory that leaves the rootfs is not listed", async (t) => {
  const root = await temporaryDirectory();
  const outside = await temporaryDirectory();
  await mkdir(join(root, "etc"), { recursive: true });
  await mkdir(join(root, "usr"), { recursive: true });
  await writeFile(join(root, "etc/os-release"), 'ID=debian\nVERSION_ID="12"\n');
  await mkdir(join(outside, "python3.9"), { recursive: true });
  try {
    await symlink(outside, join(root, "usr/lib"));
  } catch {
    t.skip("symbolic links are not available");
    return;
  }
  assert.deepEqual((await containerDetector.analyze({ root })).findings, []);
});

test("os-release parsing reads quoted values and falls back to a codename", () => {
  assert.deepEqual(
    parseOsRelease('PRETTY_NAME="Ubuntu 22.04.3 LTS"\nID=ubuntu\nVERSION_ID="22.04"\n'),
    { id: "ubuntu", line: 3, versionId: "22.04", prettyName: "Ubuntu 22.04.3 LTS" },
  );
  assert.deepEqual(parseOsRelease("ID=ubuntu\nVERSION_CODENAME=focal\n"), { id: "ubuntu", line: 2, codename: "focal" });
  assert.deepEqual(parseOsRelease("export ID=debian\n"), { id: "debian", line: 1 });
  assert.equal(parseOsRelease("NAME=something\n"), undefined);
  assert.equal(parseOsRelease("ID=\n"), undefined);
  assert.deepEqual(parseOsRelease("ID=ubuntu\nID=debian\n"), { id: "ubuntu", line: 1 });
});

test("runtime version parsers reject malformed evidence", () => {
  assert.deepEqual(parseNodeVersionHeader("#define NODE_MAJOR_VERSION 18\n"), { version: "18.0.0", line: 1 });
  assert.deepEqual(parseNodeVersionHeader("#define NODE_MAJOR_VERSION 18\n#define NODE_MINOR_VERSION 20\n#define NODE_PATCH_VERSION 4\n"), {
    version: "18.20.4",
    line: 1,
  });
  assert.equal(parseNodeVersionHeader("/* no version */\n"), undefined);
  assert.deepEqual(parseGoVersion("go1.21.5\ntime 2024-01-01\n"), { version: "1.21.5", line: 1 });
  assert.equal(parseGoVersion("go version go1.21.5\n"), undefined);
  assert.deepEqual(parseJavaRelease('JAVA_VERSION="17.0.9"\n'), { version: "17.0.9", line: 1 });
  assert.equal(parseJavaRelease('JAVA_VERSION="not a version"\n'), undefined);
});
