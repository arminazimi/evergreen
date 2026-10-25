import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

import { COMMANDS, completionShells, renderCompletions } from "../src/completions.js";

const cli = resolve("dist/src/cli.js");
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

test("each shell script names every command", () => {
  for (const shell of completionShells) {
    const script = renderCompletions(shell);
    for (const { name } of COMMANDS) assert.match(script, new RegExp(`\\b${name}\\b`), `${shell} lacks ${name}`);
  }
});

test("the CLI prints a completion script per shell and rejects anything else", () => {
  assert.match(run("completions", "bash").stdout, /complete -o default -F _evergreen evergreen/);
  assert.match(run("completions", "zsh").stdout, /^#compdef evergreen/);
  assert.match(run("completions", "fish").stdout, /complete -c evergreen/);
  const bad = run("completions", "powershell");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Usage: evergreen completions/);
});

test("--help carries one example per command", () => {
  const { stdout } = run("--help");
  assert.match(stdout, /Examples:/);
  for (const { example } of COMMANDS) assert.ok(stdout.includes(example), example);
});

test("the generated scripts parse in the shells that are installed", () => {
  for (const [shell, args] of [["bash", ["-n"]], ["zsh", ["-n"]], ["fish", ["--no-execute"]]] as const) {
    if (spawnSync(shell, ["--version"]).error) continue;
    const result = spawnSync(shell, [...args], { input: renderCompletions(shell), encoding: "utf8" });
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
  }
});
