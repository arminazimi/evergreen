import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFile(resolve(path), "utf8");

const siteStackDoc = resolve("docs/SITE_STACK.md");
const sampleAgents = resolve("examples/agents/site-stack/AGENTS.md");

const evergreenSubcommandsIn = (text: string) =>
  [...text.matchAll(/(?:^|\s|`)evergreen(?:-deprecation)? ([a-z][a-z0-9-]*)/g)].map((match) => match[1]!);

test("the site stack guide and sample exist and name Evergreen and Seaworthy", async () => {
  await access(siteStackDoc);
  await access(sampleAgents);

  const guide = await read(siteStackDoc);
  const sample = await read(sampleAgents);

  for (const [label, text] of [
    ["SITE_STACK.md", guide],
    ["examples/agents/site-stack/AGENTS.md", sample],
  ] as const) {
    assert.match(text, /Evergreen/i, label);
    assert.match(text, /Seaworthy/i, label);
  }

  assert.match(sample, /evergreen check|evergreen-deprecation check/, "the sample tells agents to check before adding deps");
  assert.match(sample, /seaworthy verify/i, "the sample documents site verification after build");
  assert.match(sample, /not on npm|first npm release|Pending Seaworthy/i, "Seaworthy maturity is honest");
});

test("every evergreen subcommand in the sample appears in the CLI usage text", async () => {
  const sample = await read(sampleAgents);
  const cli = await read("src/cli-main.ts");
  const helpStart = cli.indexOf('const HELP = `Evergreen');
  assert.ok(helpStart >= 0);
  const help = cli.slice(helpStart, cli.indexOf("`;", helpStart));

  const subcommands = [...new Set(evergreenSubcommandsIn(sample))];
  assert.ok(subcommands.length >= 2, "the sample should reference at least check and scan");
  assert.deepEqual(subcommands.sort(), ["check", "scan"]);

  for (const subcommand of subcommands) {
    assert.ok(help.includes(`evergreen ${subcommand}`), `CLI HELP should document \`evergreen ${subcommand}\``);
  }
});
