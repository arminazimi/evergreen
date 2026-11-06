import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

interface TreeNode {
  version: string;
  dependencies?: Record<string, TreeNode>;
}
interface Tree {
  dependencies?: Record<string, TreeNode>;
}
interface Package {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}
interface RootComponent {
  "bom-ref": string;
  type: string;
  name: string;
  version: string;
  purl: string;
}
interface Component extends RootComponent {
  scope: string;
}
interface Dependency {
  ref: string;
  dependsOn: string[];
}
interface Sbom {
  bomFormat: string;
  specVersion: string;
  serialNumber: string;
  version: number;
  metadata: { component: RootComponent };
  components: Component[];
  dependencies: Dependency[];
}

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  if?: string;
  uses?: string;
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on: { workflow_call?: { inputs: Record<string, { type?: string; required?: boolean }> } };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const scriptPath = resolve(".github/scripts/release-sbom.mjs");
const script = (await import(pathToFileURL(scriptPath).href)) as {
  SPEC_VERSION: string;
  purlFor(name: string, version: string): string;
  collectProductionTree(tree: Tree): { components: Component[]; dependencies: Map<string, string[]> };
  buildSbom(pkg: Package, tree: Tree, serialNumber?: string): Sbom;
  sbomProblems(document: Sbom, pkg: Package, tree?: Tree): string[];
  schemaProblems(document: unknown): string[];
};

const pkg: Package = {
  name: "evergreen-deprecation",
  version: "9.9.9",
  dependencies: { alpha: "^1.0.0", beta: "^1.0.0" },
};
const tree: Tree = {
  dependencies: {
    alpha: { version: "1.0.0", dependencies: { shared: { version: "2.0.0" } } },
    beta: {
      version: "1.0.0",
      dependencies: { shared: { version: "2.0.0" }, "@scope/pkg": { version: "3.0.0" } },
    },
  },
};

test("a package URL encodes the scope the way npm writes it", () => {
  assert.equal(script.purlFor("semver", "7.8.5"), "pkg:npm/semver@7.8.5");
  assert.equal(script.purlFor("@scope/pkg", "3.0.0"), "pkg:npm/%40scope/pkg@3.0.0");
});

test("the production tree deduplicates nested copies and sorts components", () => {
  const collected = script.collectProductionTree(tree);
  assert.deepEqual(
    collected.components.map((component) => component["bom-ref"]),
    ["pkg:npm/%40scope/pkg@3.0.0", "pkg:npm/alpha@1.0.0", "pkg:npm/beta@1.0.0", "pkg:npm/shared@2.0.0"],
  );
  assert.deepEqual(collected.dependencies.get("pkg:npm/beta@1.0.0"), [
    "pkg:npm/%40scope/pkg@3.0.0",
    "pkg:npm/shared@2.0.0",
  ]);
  assert.deepEqual(collected.dependencies.get("pkg:npm/shared@2.0.0"), []);
});

test("the generated document names the release, its runtime dependencies, and their edges", () => {
  const document = script.buildSbom(pkg, tree, "00000000-0000-4000-8000-000000000000");
  assert.equal(document.bomFormat, "CycloneDX");
  assert.equal(document.specVersion, "1.5");
  assert.equal(document.serialNumber, "urn:uuid:00000000-0000-4000-8000-000000000000");
  assert.deepEqual(document.metadata.component, {
    "bom-ref": "pkg:npm/evergreen-deprecation@9.9.9",
    type: "application",
    name: "evergreen-deprecation",
    version: "9.9.9",
    purl: "pkg:npm/evergreen-deprecation@9.9.9",
  });
  const root = document.dependencies.find((entry) => entry.ref === "pkg:npm/evergreen-deprecation@9.9.9");
  assert.deepEqual(root?.dependsOn, ["pkg:npm/alpha@1.0.0", "pkg:npm/beta@1.0.0"]);
  assert.deepEqual(document.dependencies.find((entry) => entry.ref === "pkg:npm/shared@2.0.0")?.dependsOn, []);
});

test("the generated document satisfies the CycloneDX 1.5 schema", () => {
  const document = script.buildSbom(pkg, tree);
  assert.deepEqual(script.schemaProblems(document), []);
  assert.deepEqual(script.sbomProblems(document, pkg, tree), []);
});

test("a document that drops a runtime dependency, adds one, or changes the release identity is rejected", () => {
  const document = script.buildSbom(pkg, tree);
  const withoutAlpha = {
    ...document,
    components: document.components.filter((component) => component.name !== "alpha"),
    dependencies: document.dependencies.filter((entry) => entry.ref !== "pkg:npm/alpha@1.0.0"),
  };
  assert.match(script.sbomProblems(withoutAlpha, pkg, tree).join("\n"), /runtime dependency alpha is missing/);

  const withExtra = {
    ...document,
    components: [
      ...document.components,
      { ...document.components[1]!, name: "ghost", "bom-ref": "pkg:npm/ghost@1.0.0", purl: "pkg:npm/ghost@1.0.0" },
    ],
    dependencies: [...document.dependencies, { ref: "pkg:npm/ghost@1.0.0", dependsOn: [] }],
  };
  assert.match(script.sbomProblems(withExtra, pkg, tree).join("\n"), /ghost@1\.0\.0 is not a production dependency/);

  const wrongVersion = { ...document, metadata: { component: { ...document.metadata.component, version: "0.0.0" } } };
  assert.match(script.sbomProblems(wrongVersion, pkg, tree).join("\n"), /version must be 9\.9\.9/);

  assert.match(
    script.sbomProblems(document, { ...pkg, dependencies: { ...pkg.dependencies, gamma: "^1.0.0" } }).join("\n"),
    /runtime dependency gamma is missing/,
  );
});

test("a document that loses an edge or the root entry is rejected", () => {
  const document = script.buildSbom(pkg, tree);
  const missingEdge = {
    ...document,
    dependencies: document.dependencies.filter((entry) => entry.ref !== "pkg:npm/shared@2.0.0"),
  };
  assert.match(script.sbomProblems(missingEdge, pkg, tree).join("\n"), /component pkg:npm\/shared@2\.0\.0 is missing/);

  const withoutRoot = {
    ...document,
    dependencies: document.dependencies.filter((entry) => entry.ref !== "pkg:npm/evergreen-deprecation@9.9.9"),
  };
  assert.match(script.sbomProblems(withoutRoot, pkg, tree).join("\n"), /dependencies must describe the root/);

  const wrongSpec = { ...document, specVersion: "1.4" };
  assert.match(script.sbomProblems(wrongSpec, pkg, tree).join("\n"), /specVersion must be 1\.5/);
});

test("malformed documents report every problem they have", () => {
  const document = script.buildSbom(pkg, tree);
  const first = document.components[0]!;
  const rootRef = document.metadata.component["bom-ref"];
  const ghostRef = "pkg:npm/ghost@1.0.0";
  const ghost = { ...first, name: "ghost", "bom-ref": ghostRef, purl: ghostRef };
  const withGhost = {
    ...document,
    components: [...document.components, ghost],
    dependencies: [
      ...document.dependencies.map((entry) =>
        entry.ref === rootRef ? { ...entry, dependsOn: [...entry.dependsOn, ghostRef] } : entry,
      ),
      { ref: ghostRef, dependsOn: [] },
    ],
  };
  const cases: Array<[Sbom, RegExp]> = [
    [{ ...document, serialNumber: "not-a-uuid" }, /serialNumber must be a urn:uuid identifier/],
    [{ ...document, components: "nope" } as unknown as Sbom, /components must be an array/],
    [{ ...document, components: [{ ...first, "bom-ref": "" }] }, /every component needs a bom-ref/],
    [{ ...document, components: [first, first] }, /duplicate component/],
    [{ ...document, components: [{ ...first, purl: "pkg:npm/other@1.0.0" }] }, /must carry its bom-ref as its purl/],
    [{ ...document, components: [{ ...first, type: "application" }] }, /must be a library/],
    [{ ...document, components: [{ ...first, name: 7 as unknown as string }] }, /needs a name and a version/],
    [{ ...document, dependencies: "nope" } as unknown as Sbom, /dependencies must be an array/],
    [
      { ...document, dependencies: [{ ref: 7 as unknown as string, dependsOn: [] }] },
      /every dependency entry needs a ref/,
    ],
    [
      { ...document, dependencies: [...document.dependencies, { ref: "pkg:npm/other@1.0.0", dependsOn: [] }] },
      /dependency entry pkg:npm\/other@1\.0\.0 has no component/,
    ],
    [
      {
        ...document,
        dependencies: document.dependencies.map((entry) =>
          entry.ref === rootRef ? { ...entry, dependsOn: ["pkg:npm/missing@1.0.0"] } : entry,
        ),
      },
      /root depends on pkg:npm\/missing@1\.0\.0, which is not a component/,
    ],
    [withGhost, /root must not depend on pkg:npm\/ghost@1\.0\.0/],
  ];
  for (const [broken, pattern] of cases) assert.match(script.sbomProblems(broken, pkg, tree).join("\n"), pattern);
});

test("the CLI generates a valid document and rejects a changed one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-sbom-"));
  try {
    const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8")) as Package;
    const installed: Tree = {
      dependencies: Object.fromEntries(
        Object.keys(packageJson.dependencies ?? {}).map((name) => [name, { version: "1.2.3" }]),
      ),
    };
    const treePath = join(directory, "npm-tree.json");
    const sbomPath = join(directory, "sbom.cdx.json");
    await writeFile(treePath, JSON.stringify(installed));

    const generate = spawnSync(process.execPath, [scriptPath, "generate", "--tree", treePath, "--output", sbomPath], {
      encoding: "utf8",
    });
    assert.equal(generate.status, 0, generate.stderr);
    assert.match(generate.stdout, /components for evergreen-deprecation/);

    const check = spawnSync(process.execPath, [scriptPath, "check", sbomPath, "--tree", treePath], {
      encoding: "utf8",
    });
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /Valid CycloneDX 1\.5 SBOM/);

    const document = JSON.parse(await readFile(sbomPath, "utf8")) as Sbom;
    document.components.pop();
    await writeFile(sbomPath, JSON.stringify(document));
    const broken = spawnSync(process.execPath, [scriptPath, "check", sbomPath, "--tree", treePath], {
      encoding: "utf8",
    });
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /^- /m);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the CLI refuses to guess at missing arguments or an unknown command", () => {
  for (const args of [[], ["publish"], ["generate"], ["generate", "--tree", "tree.json"], ["check"]]) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, /Usage|Unknown command/);
  }
});

test("the release workflow attaches a signed SBOM after the binaries create the release", async () => {
  const orchestratorText = await readFile(resolve(".github/workflows/release.yml"), "utf8");
  const orchestrator = parse(orchestratorText) as { jobs: Record<string, Job> };
  assert.equal(orchestrator.jobs.sbom?.uses, "./.github/workflows/release-sbom.yml");
  assert.deepEqual(orchestrator.jobs.sbom?.needs, ["publish-binaries"]);
  assert.match(orchestrator.jobs.sbom?.if ?? "", /needs\.publish-binaries\.result == 'success'/);
  assert.match(orchestratorText, /dry_run: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}/);

  const workflow = parse(await readFile(resolve(".github/workflows/release-sbom.yml"), "utf8")) as Workflow;
  const job = workflow.jobs.sbom!;
  assert.equal(workflow.on.workflow_call?.inputs.dry_run?.type, "boolean");
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(job.permissions, { contents: "write", "id-token": "write" });

  const steps = job.steps ?? [];
  const generate = steps.findIndex((step) => step.run?.includes("npm ls --omit=dev --all --json"));
  const validate = steps.findIndex((step) => step.run?.includes("release-sbom.mjs check sbom.cdx.json"));
  const sign = steps.findIndex((step) => step.run?.includes("cosign sign-blob"));
  const verify = steps.findIndex((step) => step.run?.includes("cosign verify-blob"));
  const upload = steps.findIndex((step) => step.run?.includes("gh release upload"));
  assert.ok(
    generate !== -1 && validate > generate && sign > validate && upload > sign,
    "generate, validate, sign, verify, then upload",
  );
  assert.ok(
    (steps[sign]!.run ?? "").indexOf("cosign verify-blob") > (steps[sign]!.run ?? "").indexOf("cosign sign-blob"),
    "the signature is verified before it is uploaded",
  );
  assert.match(
    steps[generate]!.run ?? "",
    /npm ls --omit=dev --all --json > npm-tree\.json[\s\S]*release-sbom\.mjs generate/,
  );
  assert.match(steps[validate]!.run ?? "", /--tree npm-tree\.json/);

  for (const index of [sign, verify, upload]) assert.equal(steps[index]!.if, "${{ !inputs.dry_run }}");
  assert.ok(steps.some((step) => step.if === "inputs.dry_run" && step.run?.includes("nothing was attached")));
  assert.equal(
    steps.find((step) => step.uses?.startsWith("sigstore/cosign-installer@"))?.uses,
    "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6",
  );
  const signRun = steps[sign]!.run ?? "";
  assert.match(signRun, /--yes --bundle sbom\.cdx\.json\.sigstore\.json sbom\.cdx\.json/);
  assert.match(signRun, /--certificate-identity-regexp "\$\{IDENTITY_PATTERN\}"/);
  assert.match(signRun, /--certificate-oidc-issuer "\$\{OIDC_ISSUER\}"/);
  assert.doesNotMatch(signRun, /--key\b|COSIGN_PRIVATE_KEY|COSIGN_PASSWORD/, "no long-lived keys");

  const uploadRun = steps[upload]!.run ?? "";
  assert.match(uploadRun, /gh release upload "\$tag" sbom\.cdx\.json sbom\.cdx\.json\.sigstore\.json --clobber/);
  assert.equal(steps[upload]!.env?.GH_TOKEN, "${{ github.token }}");

  assert.equal(
    job.env?.IDENTITY_PATTERN,
    String.raw`^https://github\.com/arminazimi/evergreen/\.github/workflows/release-sbom\.yml@refs/tags/v[0-9]+\.[0-9]+\.[0-9]+(-.+)?$`,
  );
  assert.equal(job.env?.OIDC_ISSUER, "https://token.actions.githubusercontent.com");
  const identity = new RegExp(job.env!.IDENTITY_PATTERN!);
  const prefix = "https://github.com/arminazimi/evergreen/.github/workflows/release-sbom.yml";
  assert.ok(identity.test(`${prefix}@refs/tags/v1.2.3`));
  assert.ok(identity.test(`${prefix}@refs/tags/v1.2.3-rc.1`));
  for (const rejected of [
    `${prefix}@refs/heads/main`,
    `${prefix}@refs/tags/v1`,
    "https://github.com/arminazimi/evergreen/.github/workflows/release.yml@refs/tags/v1.2.3",
    "https://github.com/someone/evergreen/.github/workflows/release-sbom.yml@refs/tags/v1.2.3",
  ]) {
    assert.equal(identity.test(rejected), false, rejected);
  }
});
