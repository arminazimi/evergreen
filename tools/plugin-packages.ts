import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const generatedRoots = [
  ".claude-plugin/marketplace.json",
  "plugins/codex",
  "plugins/claude",
] as const;

interface PackageMetadata {
  version: string;
  engines: { node: string };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function listFiles(directory: string): Promise<string[]> {
  const directFile = await readFile(directory, "utf8").catch(() => undefined);
  if (directFile !== undefined) return [directory];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat().sort();
}

export async function expectedPluginFiles(
  root = process.cwd(),
): Promise<Map<string, string>> {
  const packageMetadata = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  ) as PackageMetadata;
  const skill = await readFile(
    resolve(root, "skills/evergreen-deprecation/SKILL.md"),
    "utf8",
  );
  const identity = {
    name: "evergreen",
    version: packageMetadata.version,
    description:
      "Find, explain, migrate, and verify evidence-backed software lifecycle risks.",
    author: {
      name: "Evergreen",
      url: "https://github.com/arminazimi/evergreen",
    },
    homepage: "https://arminazimi.github.io/evergreen/",
    repository: "https://github.com/arminazimi/evergreen",
    license: "Apache-2.0",
    keywords: ["deprecation", "lifecycle", "mcp", "developer-tools"],
  };
  const mcp = json({
    mcpServers: {
      evergreen: {
        command: "npx",
        args: [
          "--yes",
          "--package",
          `evergreen-deprecation@${packageMetadata.version}`,
          "evergreen-mcp",
        ],
      },
    },
  });
  const codexManifest = json({
    ...identity,
    skills: "./skills/",
    mcpServers: "./.mcp.json",
    interface: {
      displayName: "Evergreen",
      shortDescription: "Evidence-backed deprecation intelligence",
      longDescription:
        "Scan repositories for supported lifecycle risks, inspect evidence, build migration context, and verify the result locally.",
      developerName: "Evergreen",
      category: "Developer Tools",
      capabilities: ["Read"],
      websiteURL: "https://arminazimi.github.io/evergreen/",
    },
  });
  const claudeManifest = json({
    ...identity,
    displayName: "Evergreen",
    metadata: {
      requiredNode: packageMetadata.engines.node,
      runtimePackage: `evergreen-deprecation@${packageMetadata.version}`,
    },
  });
  const claudeReadme = `# Evergreen for Claude\n\nEvergreen helps Claude find, explain, migrate, and verify software lifecycle risks without duplicating detector logic in the plugin. Its Skill guides the workflow while the bundled local MCP configuration starts the exact Evergreen npm release declared by this plugin. Repository contents stay local unless you explicitly choose to share them.\n\n## Install\n\nFrom a Claude Code session:\n\n\`\`\`text\n/plugin install evergreen --marketplace arminazimi/evergreen\n\`\`\`\n\n## What you get\n\n- Evidence-backed scans for supported runtimes, dependencies, and GitHub Actions.\n- Clear explanations linked to the matching lifecycle rule.\n- Migration context and local verification through one consistent workflow.\n- The same scan, explain, context, and verify behavior used by the Codex adapter.\n\nNode.js ${packageMetadata.engines.node.replace(">=", "")} or newer is required for the local MCP server. See the [installation and management guide](https://arminazimi.github.io/evergreen/CLAUDE_PLUGIN.html) for marketplace, project, update, disable, and removal commands.\n`;
  const claudeMarketplace = json({
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: "evergreen",
    description: "Official Evergreen plugins for software lifecycle intelligence.",
    owner: {
      name: "Evergreen",
      url: "https://arminazimi.github.io/evergreen/",
    },
    plugins: [
      {
        name: "evergreen",
        source: "./plugins/claude",
        description: identity.description,
        version: packageMetadata.version,
        author: identity.author,
        homepage: identity.homepage,
        repository: identity.repository,
        license: identity.license,
        category: "development",
        keywords: identity.keywords,
      },
    ],
  });
  const license = await readFile(resolve(root, "LICENSE"), "utf8");

  return new Map([
    [".claude-plugin/marketplace.json", claudeMarketplace],
    ["plugins/codex/.codex-plugin/plugin.json", codexManifest],
    ["plugins/codex/.mcp.json", mcp],
    ["plugins/codex/skills/evergreen-deprecation/SKILL.md", skill],
    ["plugins/claude/.claude-plugin/plugin.json", claudeManifest],
    ["plugins/claude/.mcp.json", mcp],
    ["plugins/claude/LICENSE", license],
    ["plugins/claude/README.md", claudeReadme],
    ["plugins/claude/skills/evergreen-deprecation/SKILL.md", skill],
  ]);
}

export async function buildPluginPackages(root = process.cwd()): Promise<void> {
  const expected = await expectedPluginFiles(root);
  for (const [path, contents] of expected) {
    const absolutePath = resolve(root, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
}

export async function pluginPackageDrift(root = process.cwd()): Promise<string[]> {
  const expected = await expectedPluginFiles(root);
  const actualFiles = (
    await Promise.all(generatedRoots.map((path) => listFiles(resolve(root, path))))
  )
    .flat()
    .map((path) => relative(root, path))
    .sort();
  const expectedFiles = [...expected.keys()].sort();
  const drift = new Set<string>();

  for (const path of new Set([...actualFiles, ...expectedFiles])) {
    if (!expected.has(path)) {
      drift.add(`${path}: unexpected generated file`);
      continue;
    }
    const actual = await readFile(resolve(root, path), "utf8").catch(() => undefined);
    if (actual === undefined) drift.add(`${path}: missing generated file`);
    else if (actual !== expected.get(path)) drift.add(`${path}: generated content differs`);
  }

  return [...drift].sort();
}

async function run(): Promise<void> {
  if (process.argv.includes("--check")) {
    const drift = await pluginPackageDrift();
    if (drift.length > 0) {
      process.stderr.write(`Plugin package drift detected:\n${drift.join("\n")}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write("Plugin packages match their canonical sources.\n");
    }
    return;
  }

  await buildPluginPackages();
  process.stdout.write("Generated Codex and Claude plugin packages.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
