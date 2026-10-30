import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const skillsRoot = resolve("skills");
const { version } = JSON.parse(
  await readFile(resolve("package.json"), "utf8"),
) as { version: string };
const packageMajor = version.split(".")[0];
const npxFallback = `npx -y evergreen-deprecation@${packageMajor}`;

async function readSkills(): Promise<Array<readonly [string, string]>> {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(
      async (name) =>
        [name, await readFile(resolve(skillsRoot, name, "SKILL.md"), "utf8")] as const,
    ),
  );
}

test("every Skill falls back to npx when neither MCP nor the CLI is available", async () => {
  const skills = await readSkills();
  assert.ok(skills.length >= 2, "both shipped Skills must be covered");

  for (const [name, contents] of skills) {
    assert.ok(
      contents.includes(npxFallback),
      `${name}/SKILL.md must fall back to ${npxFallback}`,
    );
    assert.match(
      contents,
      /If neither MCP nor an `evergreen` command is available/,
      `${name}/SKILL.md must say when to use the npx fallback`,
    );
    assert.match(
      contents,
      /Prefer (MCP tools|the MCP tool)/,
      `${name}/SKILL.md must still prefer MCP when the host can connect`,
    );
  }
});

test("the npx fallback pins exactly one major version from package.json", async () => {
  for (const [name, contents] of await readSkills()) {
    const specs = [
      ...contents.matchAll(/evergreen-deprecation@([0-9][^\s`)]*)/g),
    ].map((match) => match[1]);
    assert.ok(specs.length > 0, `${name}/SKILL.md must name the npx package`);
    for (const spec of specs) {
      assert.equal(
        spec,
        packageMajor,
        `${name}/SKILL.md must pin the ${packageMajor}.x major, not ${spec}`,
      );
    }
  }
});
