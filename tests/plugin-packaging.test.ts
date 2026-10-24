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

test("every canonical Skill is packaged into both plugins", async () => {
  const expected = await expectedPluginFiles();
  for (const name of ["evergreen-deprecation"]) {
    const canonical = await readFile(resolve("skills", name, "SKILL.md"), "utf8");
    assert.equal(expected.get(`plugins/codex/skills/${name}/SKILL.md`), canonical, name);
    assert.equal(expected.get(`plugins/claude/skills/${name}/SKILL.md`), canonical, name);
  }
});

test("host manifests stay thin and share one pinned runtime", async () => {
  const expected = await expectedPluginFiles();
  const portableCodex = JSON.parse(
    expected.get("plugins/codex/plugin.json")!,
  ) as Record<string, unknown>;
  const codex = JSON.parse(
    expected.get("plugins/codex/.codex-plugin/plugin.json")!,
  ) as Record<string, unknown>;
  const claude = JSON.parse(
    expected.get("plugins/claude/.claude-plugin/plugin.json")!,
  ) as Record<string, unknown>;
  const codexMcp = expected.get("plugins/codex/.mcp.json");
  const portableCodexMcp = JSON.parse(
    expected.get("plugins/codex/mcp.json")!,
  ) as {
    $schema: string;
    mcpServers: { evergreen: { type: string; args: string[] } };
  };
  const claudeMcp = expected.get("plugins/claude/.mcp.json");

  assert.equal(codex.version, claude.version);
  assert.equal(portableCodex.version, codex.version);
  assert.equal(codexMcp, claudeMcp);
  assert.equal(
    portableCodexMcp.$schema,
    "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  );
  assert.equal(portableCodexMcp.mcpServers.evergreen.type, "stdio");
  assert.ok(
    portableCodexMcp.mcpServers.evergreen.args.includes(
      `evergreen-deprecation@${String(codex.version)}`,
    ),
  );
  assert.equal(codex.skills, "./skills/");
  assert.equal(codex.mcpServers, "./.mcp.json");
  assert.ok(!("skills" in claude), "Claude uses the standard skills/ location");
  assert.ok(!("mcpServers" in claude), "Claude uses the standard .mcp.json location");

  for (const manifest of [codex, claude]) {
    const serialized = JSON.stringify(manifest);
    assert.doesNotMatch(serialized, /scan_repository|verify_migration|ruleId/);
  }
});

test("Codex marketplace exposes the portable package", async () => {
  const expected = await expectedPluginFiles();
  const marketplace = JSON.parse(
    expected.get(".agents/plugins/marketplace.json")!,
  ) as {
    name: string;
    plugins: Array<{
      name: string;
      source: { source: string; path: string };
      policy: { installation: string; authentication: string };
      category: string;
    }>;
  };
  const portable = JSON.parse(expected.get("plugins/codex/plugin.json")!) as {
    $schema: string;
    name: string;
    extensions: {
      "com.openai": {
        interface: Record<string, unknown>;
        requires_local_executor: boolean;
      };
    };
  };
  const compatibility = JSON.parse(
    expected.get("plugins/codex/.codex-plugin/plugin.json")!,
  ) as { interface: Record<string, unknown> };
  const entry = marketplace.plugins[0];

  assert.equal(
    portable.$schema,
    "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  );
  assert.equal(portable.extensions["com.openai"].requires_local_executor, true);
  assert.deepEqual(
    portable.extensions["com.openai"].interface,
    compatibility.interface,
  );
  assert.equal(marketplace.name, "evergreen-codex");
  assert.equal(entry?.name, portable.name);
  assert.deepEqual(entry?.source, {
    source: "local",
    path: "./plugins/codex",
  });
  assert.deepEqual(entry?.policy, {
    installation: "AVAILABLE",
    authentication: "ON_INSTALL",
  });
  assert.equal(entry?.category, "Developer Tools");
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

test("Codex submission assets stay review-ready and on-brand", async () => {
  const expected = await expectedPluginFiles();
  const manifest = JSON.parse(
    expected.get("plugins/codex/.codex-plugin/plugin.json")!,
  ) as {
    interface: Record<string, unknown>;
    requires_local_executor: boolean;
  };
  const review = JSON.parse(
    expected.get("plugins/codex/review/submission.json")!,
  ) as {
    test_cases: { positive: unknown[]; negative: unknown[] };
    demo_recording_url: string | null;
  };

  assert.equal(manifest.requires_local_executor, true);
  assert.equal(manifest.interface.logo, "./assets/evergreen-mark-light.svg");
  assert.equal(manifest.interface.composerIcon, "./assets/evergreen-mark-light.svg");
  assert.equal(
    expected.get("plugins/codex/assets/evergreen-mark-light.svg"),
    await readFile(resolve("brand/assets/evergreen-mark-light.svg"), "utf8"),
  );
  assert.equal(
    expected.get("plugins/codex/assets/evergreen-mark-dark.svg"),
    await readFile(resolve("brand/assets/evergreen-mark-dark.svg"), "utf8"),
  );
  assert.equal(review.test_cases.positive.length, 5);
  assert.equal(review.test_cases.negative.length, 3);
  assert.equal(review.demo_recording_url, null);
});

test("plugin drift check rejects a changed generated package", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-plugin-drift-"));
  try {
    await mkdir(join(root, "skills/evergreen-deprecation"), { recursive: true });
    await mkdir(join(root, "brand/assets"), { recursive: true });
    await mkdir(join(root, "integrations/dependency-guard"), { recursive: true });
    await mkdir(join(root, "examples/demo/.github/workflows"), { recursive: true });
    await mkdir(join(root, "examples/demo/src"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      await readFile(resolve("package.json"), "utf8"),
    );
    await writeFile(join(root, "LICENSE"), await readFile(resolve("LICENSE"), "utf8"));
    for (const path of [
      "brand/assets/evergreen-mark-light.svg",
      "brand/assets/evergreen-mark-dark.svg",
      "integrations/dependency-guard/guard.mjs",
      "examples/demo/package.json",
      "examples/demo/.github/workflows/ci.yml",
      "examples/demo/src/client.js",
    ]) {
      await writeFile(join(root, path), await readFile(resolve(path), "utf8"));
    }
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
