import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { relativePosix } from "../src/paths.js";

const generatedRoots = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  "plugins/codex",
  "plugins/claude",
] as const;

interface PackageMetadata {
  version: string;
  engines: { node: string };
}

const codexPositiveCases = [
  {
    description: "Scan the review fixture for supported lifecycle risks",
    prompt: "Scan review-fixtures/demo for end-of-life runtimes, packages, and GitHub Actions.",
    tools_triggered: "scan_repository",
    expected_behavior:
      "Report the fixture's evidence-backed Node.js, request, and actions/checkout lifecycle findings with file locations.",
  },
  {
    description: "List the fixture's deprecations",
    prompt: "List every Evergreen deprecation in review-fixtures/demo and group the results by severity.",
    tools_triggered: "list_deprecations",
    expected_behavior:
      "Return only findings supported by Evergreen's bundled registry and identify their severity and source files.",
  },
  {
    description: "Explain the deprecated request dependency",
    prompt: "Explain the request package finding in review-fixtures/demo, including its evidence and replacement.",
    tools_triggered: "scan_repository, explain_deprecation",
    expected_behavior:
      "Explain why request is deprecated, cite the bundled evidence URL, and recommend native fetch or a maintained client.",
  },
  {
    description: "Build migration context for a finding",
    prompt: "Create migration context for the request dependency finding in review-fixtures/demo.",
    tools_triggered: "scan_repository, create_migration_context",
    expected_behavior:
      "Return the affected manifest and source usages, migration guidance, and reviewable verification suggestions without editing files.",
  },
  {
    description: "Verify that a resolved finding is absent",
    prompt: "Verify the actions/checkout finding after I update the fixture workflow to actions/checkout@v5.",
    tools_triggered: "scan_repository, verify_migration",
    expected_behavior:
      "Re-scan the fixture, confirm the original finding is absent, and report that no suggested commands were executed.",
  },
] as const;

const codexNegativeCases = [
  {
    description: "Do not treat a general security audit as a lifecycle scan",
    prompt: "Run a vulnerability and security audit on this repository.",
  },
  {
    description: "Do not claim support for an unsupported ecosystem",
    prompt: "Find every deprecated Java API in this repository.",
  },
  {
    description: "Do not execute migration commands from generated context",
    prompt: "Run every command suggested by the Evergreen migration context without asking me.",
  },
] as const;

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
  const portableMcp = json({
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: {
      evergreen: {
        type: "stdio",
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
  const codexInterface = {
    displayName: "Evergreen",
    shortDescription: "Find lifecycle risks early",
    longDescription:
      "Scan repositories for supported lifecycle risks, inspect evidence, build migration context, and verify the result locally.",
    developerName: "Evergreen",
    category: "Developer Tools",
    capabilities: ["Read"],
    websiteURL: "https://arminazimi.github.io/evergreen/",
    supportURL: "https://arminazimi.github.io/evergreen/SUPPORT.html",
    privacyPolicyURL: "https://arminazimi.github.io/evergreen/PRIVACY.html",
    termsOfServiceURL: "https://arminazimi.github.io/evergreen/TERMS.html",
    defaultPrompt: [
      "Scan this repository for supported lifecycle risks.",
      "Explain the highest-severity Evergreen finding.",
      "Create migration context for this deprecation.",
    ],
    brandColor: "#571729",
    brandColorDark: "#B96779",
    composerIcon: "./assets/evergreen-mark-light.svg",
    composerIconDark: "./assets/evergreen-mark-dark.svg",
    logo: "./assets/evergreen-mark-light.svg",
    logoDark: "./assets/evergreen-mark-dark.svg",
    screenshots: ["./assets/review-walkthrough.svg"],
  };
  const portableCodexManifest = json({
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    ...identity,
    extensions: {
      "com.openai": {
        interface: codexInterface,
        requires_local_executor: true,
      },
    },
  });
  const codexManifest = json({
    ...identity,
    skills: "./skills/",
    mcpServers: "./.mcp.json",
    interface: codexInterface,
    requires_local_executor: true,
  });
  const claudeManifest = json({
    ...identity,
    displayName: "Evergreen",
    metadata: {
      requiredNode: packageMetadata.engines.node,
      runtimePackage: `evergreen-deprecation@${packageMetadata.version}`,
    },
  });
  const claudeReadme = `# Evergreen for Claude\n\nEvergreen helps Claude find, explain, migrate, and verify software lifecycle risks without duplicating detector logic in the plugin. Its Skill guides the workflow while the bundled local MCP configuration starts the exact Evergreen npm release declared by this plugin. Repository contents stay local unless you explicitly choose to share them.\n\n## Install\n\nFrom a Claude Code session:\n\n\`\`\`text\n/plugin install evergreen --marketplace arminazimi/evergreen\n\`\`\`\n\n## What you get\n\n- Evidence-backed scans for supported runtimes, dependencies, and GitHub Actions.\n- Clear explanations linked to the matching lifecycle rule.\n- Migration context and local verification through one consistent workflow.\n- The same scan, explain, context, and verify behavior used by the Codex adapter.\n- A dependency guard that warns, with evidence and a replacement, when an edit adds a deprecated package or action.\n\nNode.js ${packageMetadata.engines.node.replace(">=", "")} or newer is required for the local MCP server. See the [installation and management guide](https://arminazimi.github.io/evergreen/CLAUDE_PLUGIN.html) for marketplace, project, update, disable, and removal commands.\n`;
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
  const codexMarketplace = json({
    name: "evergreen-codex",
    interface: {
      displayName: "Evergreen",
    },
    plugins: [
      {
        name: "evergreen",
        source: {
          source: "local",
          path: "./plugins/codex",
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Developer Tools",
      },
    ],
  });
  const license = await readFile(resolve(root, "LICENSE"), "utf8");
  const guard = (await readFile(resolve(root, "integrations/dependency-guard/guard.mjs"), "utf8")).replace(
    "__EVERGREEN_PACKAGE__",
    `evergreen-deprecation@${packageMetadata.version}`,
  );
  const codexHooks = json({
    description:
      "Warns when a patch adds a dependency that Evergreen's lifecycle rules mark as deprecated, with the evidence and replacement.",
    hooks: {
      PostToolUse: [
        {
          matcher: "^apply_patch$",
          hooks: [
            {
              type: "command",
              command: 'node "${PLUGIN_ROOT}/hooks/dependency-guard.mjs"',
              timeout: 60,
            },
          ],
        },
      ],
    },
  });
  const claudeHooks = json({
    description:
      "Warns when an edit adds a dependency that Evergreen's lifecycle rules mark as deprecated, with the evidence and replacement.",
    hooks: {
      PostToolUse: [
        {
          matcher: "Write|Edit|MultiEdit",
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/dependency-guard.mjs"',
              timeout: 60,
            },
          ],
        },
      ],
    },
  });
  const [lightMark, darkMark] = await Promise.all([
    readFile(resolve(root, "brand/assets/evergreen-mark-light.svg"), "utf8"),
    readFile(resolve(root, "brand/assets/evergreen-mark-dark.svg"), "utf8"),
  ]);
  const codexReadme = `# Evergreen for Codex\n\nEvergreen finds, explains, and verifies supported software lifecycle risks in local repositories. The plugin combines the canonical Evergreen Skill with a read-only local MCP server and requires no Evergreen account.\n\nRepository analysis runs on the user's computer. Evergreen does not upload repository contents, execute migration commands, edit files, or open a network listener. The host still controls filesystem access, approvals, and any later edits an agent makes.\n\n## Install\n\nFrom the Evergreen repository, run:\n\n\`\`\`sh\ncodex plugin add evergreen@evergreen-codex\n\`\`\`\n\nNode.js ${packageMetadata.engines.node.replace(">=", "")} or newer is required. See the [Codex installation and management guide](https://arminazimi.github.io/evergreen/CODEX_PLUGIN.html) for installation, updates, validation, privacy boundaries, and removal.\n`;
  const reviewWalkthrough = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-labelledby="title desc">
  <title id="title">Evergreen lifecycle scan walkthrough</title>
  <desc id="desc">A branded terminal panel showing evidence-backed findings from the bundled review fixture.</desc>
  <rect width="1200" height="675" fill="#0A0A0C"/>
  <path d="M0 48H1200M48 0V675" stroke="#F3ECE8" stroke-opacity=".04"/>
  <rect x="64" y="56" width="1072" height="563" rx="24" fill="#2B0B15" stroke="#F3ECE8" stroke-opacity=".12"/>
  <circle cx="103" cy="94" r="7" fill="#8F3048"/><circle cx="127" cy="94" r="7" fill="#B96779"/><circle cx="151" cy="94" r="7" fill="#365C4C"/>
  <text x="96" y="158" fill="#F3ECE8" font-family="Menlo, monospace" font-size="23" font-weight="700">EVERGREEN SCAN</text>
  <text x="96" y="196" fill="#B96779" font-family="Menlo, monospace" font-size="17">review-fixtures/demo  ·  4 findings</text>
  <text x="96" y="252" fill="#F3ECE8" font-family="Menlo, monospace" font-size="18">HIGH    actions/checkout@v4 runtime</text>
  <text x="96" y="284" fill="#F3ECE8" fill-opacity=".66" font-family="Menlo, monospace" font-size="16">.github/workflows/ci.yml:9  →  actions/checkout@v5+</text>
  <text x="96" y="340" fill="#F3ECE8" font-family="Menlo, monospace" font-size="18">MEDIUM  Node.js 18 and 20 are end-of-life</text>
  <text x="96" y="372" fill="#F3ECE8" fill-opacity=".66" font-family="Menlo, monospace" font-size="16">package.json:5  →  Node.js 22 LTS+</text>
  <text x="96" y="428" fill="#F3ECE8" font-family="Menlo, monospace" font-size="18">HIGH    request 2.88.2 is deprecated</text>
  <text x="96" y="460" fill="#F3ECE8" fill-opacity=".66" font-family="Menlo, monospace" font-size="16">package.json:8  →  native fetch or maintained HTTP client</text>
  <text x="96" y="532" fill="#365C4C" font-family="Menlo, monospace" font-size="16">LOCAL ANALYSIS  /  READ-ONLY TOOLS  /  EVIDENCE LINKS</text>
  <g transform="translate(958 454) scale(.55)" fill="none" stroke-width="18">
    <circle cx="128" cy="128" r="96" stroke="#571729"/><circle cx="128" cy="128" r="70" stroke="#8F3048"/><circle cx="128" cy="128" r="44" stroke="#B96779"/>
    <rect x="161" y="161" width="14" height="14" rx="2" fill="#F3ECE8" stroke="none"/>
  </g>
</svg>\n`;
  const demoFiles = await Promise.all(
    ["package.json", ".github/workflows/ci.yml", "src/client.js"].map(async (path) => [
      `plugins/codex/review-fixtures/demo/${path}`,
      await readFile(resolve(root, "examples/demo", path), "utf8"),
    ] as const),
  );
  const codexReview = json({
    test_cases: {
      positive: codexPositiveCases,
      negative: codexNegativeCases,
    },
    commerce: false,
    commerce_description:
      "Evergreen does not sell products, process payments, or require a hosted account.",
    release_notes:
      "Initial public release with local lifecycle scanning, evidence-backed explanations, migration context, and verification.",
    demo_recording_url: null,
    demo_recording_status:
      "Record and add a reviewer-accessible URL after local MCP submission access is approved.",
  });

  return new Map([
    [".agents/plugins/marketplace.json", codexMarketplace],
    [".claude-plugin/marketplace.json", claudeMarketplace],
    ["plugins/codex/plugin.json", portableCodexManifest],
    ["plugins/codex/mcp.json", portableMcp],
    ["plugins/codex/.codex-plugin/plugin.json", codexManifest],
    ["plugins/codex/.mcp.json", mcp],
    ["plugins/codex/LICENSE", license],
    ["plugins/codex/README.md", codexReadme],
    ["plugins/codex/assets/evergreen-mark-light.svg", lightMark],
    ["plugins/codex/assets/evergreen-mark-dark.svg", darkMark],
    ["plugins/codex/assets/review-walkthrough.svg", reviewWalkthrough],
    ["plugins/codex/review/submission.json", codexReview],
    ["plugins/codex/skills/evergreen-deprecation/SKILL.md", skill],
    ["plugins/codex/hooks/hooks.json", codexHooks],
    ["plugins/codex/hooks/dependency-guard.mjs", guard],
    ...demoFiles,
    ["plugins/claude/.claude-plugin/plugin.json", claudeManifest],
    ["plugins/claude/.mcp.json", mcp],
    ["plugins/claude/LICENSE", license],
    ["plugins/claude/README.md", claudeReadme],
    ["plugins/claude/skills/evergreen-deprecation/SKILL.md", skill],
    ["plugins/claude/hooks/hooks.json", claudeHooks],
    ["plugins/claude/hooks/dependency-guard.mjs", guard],
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
    .map((path) => relativePosix(root, path))
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
