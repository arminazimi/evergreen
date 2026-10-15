import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  buildPluginPackages,
  expectedPluginFiles,
  pluginPackageDrift,
} from "../tools/plugin-packages.js";

test("generated plugin packages match canonical shared assets", async () => {
  assert.deepEqual(await pluginPackageDrift(), []);

  const expected = await expectedPluginFiles();
  const canonicalSkill = await readFile(
    resolve("skills/evergreen-deprecation/SKILL.md"),
    "utf8",
  );
  assert.equal(
    expected.get("plugins/codex/skills/evergreen-deprecation/SKILL.md"),
    canonicalSkill,
  );
  assert.equal(
    expected.get("plugins/claude/skills/evergreen-deprecation/SKILL.md"),
    canonicalSkill,
  );
});

test("host manifests stay thin and share one pinned runtime", async () => {
  const expected = await expectedPluginFiles();
  const codex = JSON.parse(
    expected.get("plugins/codex/.codex-plugin/plugin.json")!,
  ) as Record<string, unknown>;
  const claude = JSON.parse(
    expected.get("plugins/claude/.claude-plugin/plugin.json")!,
  ) as Record<string, unknown>;
  const codexMcp = expected.get("plugins/codex/.mcp.json");
  const claudeMcp = expected.get("plugins/claude/.mcp.json");

  assert.equal(codex.version, claude.version);
  assert.equal(codexMcp, claudeMcp);
  assert.equal(codex.skills, "./skills/");
  assert.equal(codex.mcpServers, "./.mcp.json");
  assert.ok(!("skills" in claude), "Claude uses the standard skills/ location");
  assert.ok(!("mcpServers" in claude), "Claude uses the standard .mcp.json location");

  for (const manifest of [codex, claude]) {
    const serialized = JSON.stringify(manifest);
    assert.doesNotMatch(serialized, /scan_repository|verify_migration|ruleId/);
  }
});

test("Claude marketplace installs the generated Claude adapter", async () => {
  const expected = await expectedPluginFiles();
  const marketplace = JSON.parse(
    expected.get(".claude-plugin/marketplace.json")!,
  ) as {
    name: string;
    plugins: Array<Record<string, unknown>>;
  };
  const claude = JSON.parse(
    expected.get("plugins/claude/.claude-plugin/plugin.json")!,
  ) as Record<string, unknown>;
  const entry = marketplace.plugins[0];

  assert.equal(marketplace.name, "evergreen");
  assert.ok(entry);
  assert.equal(entry.name, claude.name);
  assert.equal(entry.version, claude.version);
  assert.equal(entry.source, "./plugins/claude");
  assert.ok(expected.get("plugins/claude/README.md")!.split(/\s+/).length >= 40);
  assert.ok(expected.get("plugins/claude/LICENSE")!.includes("Apache License"));
});

test("plugin drift check rejects a changed generated package", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-plugin-drift-"));
  try {
    await mkdir(join(root, "skills/evergreen-deprecation"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      await readFile(resolve("package.json"), "utf8"),
    );
    await writeFile(join(root, "LICENSE"), await readFile(resolve("LICENSE"), "utf8"));
    await writeFile(
      join(root, "skills/evergreen-deprecation/SKILL.md"),
      await readFile(resolve("skills/evergreen-deprecation/SKILL.md"), "utf8"),
    );
    await buildPluginPackages(root);
    await appendFile(
      join(root, "plugins/claude/skills/evergreen-deprecation/SKILL.md"),
      "\nmanual drift\n",
    );

    assert.deepEqual(await pluginPackageDrift(root), [
      "plugins/claude/skills/evergreen-deprecation/SKILL.md: generated content differs",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
