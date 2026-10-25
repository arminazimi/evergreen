import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult } from "../src/domain.js";
import { canBrowse, editorCommand, reduce, renderList } from "../src/tui.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const finding = (path: string, line?: number): Finding =>
  ({ id: "f", title: "Old thing", severity: "high", location: { path, ...(line ? { line } : {}) } }) as unknown as Finding;

test("keys move the selection within bounds and switch views", () => {
  let state = reduce({ view: "list", selected: 0 }, { name: "up" }, 2);
  assert.equal(state.selected, 0);
  state = reduce(state, { name: "j" }, 2);
  state = reduce(state, { name: "down" }, 2);
  assert.equal(state.selected, 1);
  state = reduce(state, { name: "return" }, 2);
  assert.equal(state.view, "detail");
  assert.equal(reduce(state, { name: "o" }, 2).open, true);
  assert.equal(reduce(state, { name: "escape" }, 2).view, "list");
  assert.equal(reduce(state, { name: "c", ctrl: true }, 2).quit, true);
  assert.equal(reduce({ view: "list", selected: 0 }, { name: "return" }, 0).view, "list");
});

test("the list marks the selected finding and shows its location", () => {
  const result = { root: "/r", findings: [finding("package.json", 3), finding("a.js")] } as unknown as ScanResult;
  const text = renderList(result, 1);
  assert.match(text, /^ {2}HIGH {5}Old thing {2}package\.json:3$/m);
  assert.match(text, /^> HIGH {5}Old thing {2}a\.js$/m);
});

test("editorCommand jumps to the line for known editors and stays inside the repository", () => {
  const root = resolve("repo");
  const file = resolve(root, "package.json");
  assert.deepEqual(editorCommand(root, finding("package.json", 4), { EDITOR: "vim" }), { command: "vim", args: ["+4", file] });
  assert.deepEqual(editorCommand(root, finding("package.json", 4), { VISUAL: "code -r" }), { command: "code", args: ["-r", "--goto", `${file}:4`] });
  assert.deepEqual(editorCommand(root, finding("package.json"), { EDITOR: "nano" }), { command: "nano", args: [file] });
  assert.equal(editorCommand(root, finding("../secret", 1), { EDITOR: "vim" }), undefined);
  assert.equal(editorCommand(root, finding(resolve("elsewhere/x"), 1), { EDITOR: "vim" }), undefined);
});

test("the browser needs a TTY on both ends", () => {
  assert.equal(canBrowse({ isTTY: true }, { isTTY: true }), true);
  assert.equal(canBrowse({ isTTY: true }, {}), false);
  assert.equal(canBrowse({}, { isTTY: true }), false);
});

test("scan --interactive falls back to the text report when not a terminal", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-tui-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "x", dependencies: { request: "2.88.2" } }));
  const plain = await execute(process.execPath, [cli, "scan", root]);
  const interactive = await execute(process.execPath, [cli, "scan", root, "--interactive"]);
  assert.equal(interactive.stdout, plain.stdout);
});
