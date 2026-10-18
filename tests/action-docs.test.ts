import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

interface ActionDefinition {
  inputs: Record<string, { default?: unknown; required?: unknown }>;
  outputs: Record<string, unknown>;
}

/** The rows of the Markdown table that starts with this header cell, as arrays of cell text. */
function tableRows(markdown: string, firstHeader: string): string[][] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`| ${firstHeader} |`));
  assert.notEqual(start, -1, `docs/GITHUB_ACTION.md has no table whose header starts with "${firstHeader}"`);
  const rows: string[][] = [];
  for (let index = start + 2; index < lines.length && lines[index]!.startsWith("|"); index += 1) {
    // Cells are split on pipes that are not escaped; the docs do not put pipes inside code spans.
    rows.push(lines[index]!.slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim()));
  }
  return rows;
}

const unquote = (cell: string): string => cell.replace(/^`(.*)`$/, "$1");

/** The default as the docs write it: `empty` for the empty string, otherwise the value in code ticks. */
const documentedDefault = (cell: string): string => (cell === "empty" ? "" : unquote(cell));

async function load() {
  const action = parse(await readFile(resolve("action.yml"), "utf8")) as ActionDefinition;
  const docs = await readFile(resolve("docs/GITHUB_ACTION.md"), "utf8");
  return { action, docs };
}

test("docs/GITHUB_ACTION.md documents exactly the inputs of action.yml, with the same defaults", async () => {
  const { action, docs } = await load();
  const rows = tableRows(docs, "Input");
  const documented = new Map(rows.map((row) => [unquote(row[0]!), documentedDefault(row[1]!)]));
  assert.equal(documented.size, rows.length, "an input is documented twice");
  assert.deepEqual([...documented.keys()].sort(), Object.keys(action.inputs).sort(), "inputs documented and inputs in action.yml differ");
  for (const [name, input] of Object.entries(action.inputs)) {
    assert.equal(documented.get(name), String(input.default ?? ""), `the documented default of "${name}" differs from action.yml`);
  }
});

test("docs/GITHUB_ACTION.md documents exactly the outputs of action.yml", async () => {
  const { action, docs } = await load();
  const documented = tableRows(docs, "Output").map((row) => unquote(row[0]!));
  assert.deepEqual([...documented].sort(), Object.keys(action.outputs).sort(), "outputs documented and outputs in action.yml differ");
});

test("every input has a default, and the docs say every input is optional exactly when none is required", async () => {
  const { action, docs } = await load();
  for (const [name, input] of Object.entries(action.inputs)) {
    assert.ok(input.default !== undefined, `input "${name}" has no default in action.yml, so the docs table cannot show one`);
  }
  const anyRequired = Object.values(action.inputs).some((input) => input.required === true);
  assert.equal(docs.includes("Every input is optional."), !anyRequired, "docs claim about optional inputs disagrees with action.yml");
});

test("the table reader reports a missing table and keeps escaped pipes inside a cell", () => {
  assert.throws(() => tableRows("nothing here", "Input"), /no table/);
  assert.deepEqual(tableRows("| Input | Default |\n| --- | --- |\n| `a` | x \\| y |\n\ntext", "Input"), [["`a`", "x \\| y"]]);
});
