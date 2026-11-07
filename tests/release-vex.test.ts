import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

interface Statement {
  id: string;
  package: string;
  versions?: string[];
  state: string;
  justification: string;
  detail: string;
  source?: { name?: string; url: string };
}
interface Component {
  "bom-ref": string;
  name: string;
  version: string;
}
interface Sbom {
  serialNumber: string;
  version: number;
  metadata: {
    component: {
      "bom-ref": string;
      type: string;
      name: string;
      version: string;
    };
  };
  components: Component[];
}
interface Vex {
  vulnerabilities: {
    "bom-ref": string;
    id: string;
    affects: { ref: string }[];
  }[];
  [key: string]: unknown;
}

const script = (await import(pathToFileURL(resolve(".github/scripts/release-vex.mjs")).href)) as {
  statementProblems(statement: unknown): string[];
  readStatements(directory: string): Statement[];
  buildVex(sbom: Sbom, statements: Statement[], serialNumber?: string): Vex;
  vexProblems(document: unknown, sbom: Sbom, statements: Statement[]): string[];
};
const sbomScript = (await import(pathToFileURL(resolve(".github/scripts/release-sbom.mjs")).href)) as {
  schemaProblems(document: unknown): string[];
};

const sbom: Sbom = {
  serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
  version: 1,
  metadata: {
    component: {
      "bom-ref": "pkg:npm/evergreen-deprecation@9.9.9",
      type: "application",
      name: "evergreen-deprecation",
      version: "9.9.9",
    },
  },
  components: [
    { "bom-ref": "pkg:npm/alpha@1.0.0", name: "alpha", version: "1.0.0" },
    { "bom-ref": "pkg:npm/alpha@2.0.0", name: "alpha", version: "2.0.0" },
  ],
};
const statement: Statement = {
  id: "GHSA-aaaa-bbbb-cccc",
  package: "alpha",
  versions: ["1.0.0"],
  state: "not_affected",
  justification: "code_not_reachable",
  detail: "Evergreen never calls the vulnerable parser with untrusted input.",
  source: {
    name: "GitHub Advisory Database",
    url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  },
};

test("the repository's own statements are well formed", () => {
  assert.doesNotThrow(() => script.readStatements(resolve("security/vex")));
});

test("a statement needs an advisory id, a state, a justification, and a real reason", () => {
  assert.deepEqual(script.statementProblems(statement), []);
  assert.ok(script.statementProblems({ ...statement, id: "alpha" }).length > 0);
  assert.ok(script.statementProblems({ ...statement, state: "affected" }).length > 0);
  assert.ok(script.statementProblems({ ...statement, justification: "because" }).length > 0);
  assert.ok(script.statementProblems({ ...statement, detail: "ok" }).length > 0);
  assert.ok(script.statementProblems({ ...statement, versions: [] }).length > 0);
  assert.ok(
    script.statementProblems({
      ...statement,
      source: { url: "http://example.com" },
    }).length > 0,
  );
  assert.ok(script.statementProblems({ ...statement, extra: true }).length > 0);
  assert.deepEqual(script.statementProblems([]), ["must be an object"]);
});

test("the VEX file links each statement to the SBOM components it names", () => {
  const document = script.buildVex(sbom, [statement, { ...statement, id: "GHSA-dddd-eeee-ffff", package: "gone" }]);
  assert.equal(document.vulnerabilities.length, 1);
  assert.deepEqual(document.vulnerabilities[0]?.affects, [
    {
      ref: "urn:cdx:00000000-0000-4000-8000-000000000001/1#pkg%3Anpm%2Falpha%401.0.0",
    },
  ]);
  assert.deepEqual(sbomScript.schemaProblems(document), []);
  assert.deepEqual(script.vexProblems(document, sbom, [statement]), []);
});

test("a statement without versions covers every shipped version", () => {
  const { versions: _versions, ...all } = statement;
  assert.equal(script.buildVex(sbom, [all]).vulnerabilities[0]?.affects.length, 2);
});

test("with no statements the VEX file is valid and empty", () => {
  const document = script.buildVex(sbom, []);
  assert.deepEqual(document.vulnerabilities, []);
  assert.deepEqual(sbomScript.schemaProblems(document), []);
  assert.deepEqual(script.vexProblems(document, sbom, []), []);
});

test("a VEX file that drops, invents, or misdirects a statement is rejected", () => {
  const document = script.buildVex(sbom, [statement]);
  assert.ok(
    script.vexProblems({ ...document, vulnerabilities: [] }, sbom, [statement]).some((p) => p.includes("is missing")),
  );
  assert.ok(script.vexProblems(document, sbom, []).some((p) => p.includes("is not in security/vex")));
  const misdirected = {
    ...document,
    vulnerabilities: [
      {
        ...document.vulnerabilities[0],
        affects: [{ ref: "urn:cdx:x/1#nope" }],
      },
    ],
  };
  assert.ok(script.vexProblems(misdirected, sbom, [statement]).some((p) => p.includes("not a component")));
  const wrongRelease = {
    ...document,
    metadata: { component: { "bom-ref": "pkg:npm/other@1.0.0" } },
  };
  assert.ok(script.vexProblems(wrongRelease, sbom, [statement]).some((p) => p.includes("metadata.component")));
});

test("the release stage validates the VEX file, signs it, and attaches it beside the SBOM", async () => {
  const workflow = parse(await readFile(resolve(".github/workflows/release-sbom.yml"), "utf8")) as {
    jobs: Record<string, { steps: { run?: string; if?: string }[] }>;
  };
  const steps = workflow.jobs.sbom!.steps;
  const check = steps.findIndex((step) => step.run?.includes("release-vex.mjs check vex.cdx.json"));
  const sign = steps.findIndex((step) =>
    step.run?.includes("cosign sign-blob --yes --bundle vex.cdx.json.sigstore.json"),
  );
  const upload = steps.findIndex((step) =>
    step.run?.includes('gh release upload "$tag" vex.cdx.json vex.cdx.json.sigstore.json'),
  );
  assert.ok(check !== -1 && sign > check && upload > sign, "validate, sign, then upload");
  assert.equal(steps[sign]!.if, "${{ !inputs.dry_run }}");
  assert.match(steps[sign]!.run ?? "", /cosign verify-blob/);
});
