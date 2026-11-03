import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { parseAllDocuments } from "yaml";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { MAXIMUM_DOCUMENTS, MAXIMUM_INPUT_BYTES } from "../src/detectors/kubernetes/parse-manifest.js";
import type { Finding, ScanResult } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";
import { kubernetesApiVersionFixer, kubernetesIngressV1Fixer, planFixReport, renderPatches } from "../src/fix/index.js";

const execute = promisify(execFile);
const fixtures = resolve("tests/fixtures/fix/k8s-ingress-v1");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-k8s-ingress-v1-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

interface Refusal {
  path: string;
  line: number | undefined;
  reason: string;
}

async function plan(root: string): Promise<{ result: ScanResult; patches: Awaited<ReturnType<typeof kubernetesIngressV1Fixer.plan>>; refusals: Refusal[] }> {
  const result = await scanRepository(root, detectors);
  const refusals: Refusal[] = [];
  const patches = await kubernetesIngressV1Fixer.plan(result, (finding, reason) => {
    refusals.push({ path: finding.location.path, line: finding.location.line, reason });
  });
  return { result, patches, refusals };
}

async function apply(root: string, patches: Awaited<ReturnType<typeof kubernetesIngressV1Fixer.plan>>): Promise<void> {
  await writeFile(join(root, "fix.patch"), renderPatches(patches));
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "core.autocrlf", "false"], { cwd: root });
  await execute("git", ["apply", "--check", "fix.patch"], { cwd: root });
  await execute("git", ["apply", "fix.patch"], { cwd: root });
}

function finding(path: string, line: number | undefined, ruleId = "kubernetes.extensions.ingress.v1beta1.removed"): Finding {
  return {
    id: `${ruleId}:${path}:${line ?? 0}`,
    ruleId,
    detector: "kubernetes",
    title: "Ingress extensions/v1beta1 is no longer served",
    summary: `The manifest declares ${ruleId.includes("networking") ? "networking.k8s.io/v1beta1" : "extensions/v1beta1"} Ingress. Migrate it.`,
    severity: "high",
    confidence: "exact",
    location: { path, ...(line === undefined ? {} : { line }) },
    sources: [{ title: "Kubernetes Deprecated API Migration Guide", url: "https://kubernetes.io/docs/reference/using-api/deprecation-guide/" }],
  };
}

function manualScan(root: string, findings: Finding[]): ScanResult {
  return {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-11-03T00:00:00.000Z",
    findings,
    diagnostics: [],
  };
}

/** The first document of a manifest, as the YAML parser reads it back. */
function firstDocument(contents: string): Record<string, unknown> {
  const [document] = parseAllDocuments(contents);
  const value = document?.toJS();
  assert.ok(typeof value === "object" && value !== null, "the patched manifest must parse");
  return value as Record<string, unknown>;
}

const ingress = `apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: web
spec:
  rules:
  - http:
      paths:
      - path: /
        backend:
          serviceName: web
          servicePort: 80
`;

test("the planner rewrites the before fixture to the after fixture and never writes in place", async () => {
  const before = await readFile(join(fixtures, "before.yaml"), "utf8");
  const after = await readFile(join(fixtures, "after.yaml"), "utf8");
  const root = await repository({ "manifests/ingress.yaml": before });
  const { patches } = await plan(root);

  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.path, "manifests/ingress.yaml");
  assert.ok(patches[0]!.diff.includes("-apiVersion: extensions/v1beta1\n"));
  assert.ok(patches[0]!.diff.includes("+apiVersion: networking.k8s.io/v1\n"));
  assert.ok(patches[0]!.diff.includes("-    serviceName: default-svc\n"));
  assert.ok(patches[0]!.diff.includes("+      name: default-svc\n"));
  assert.ok(patches[0]!.diff.includes("+                name: shop-api # the api service\n"), "the comment written after a value survives");
  assert.ok(patches[0]!.diff.includes("+                  number: 9000 # the api port\n"));
  assert.equal(await readFile(join(root, "manifests", "ingress.yaml"), "utf8"), before, "planning must not modify the file");

  await apply(root, patches);
  assert.equal(await readFile(join(root, "manifests", "ingress.yaml"), "utf8"), after, "the patch must produce the after fixture");
  assert.equal(firstDocument(after).apiVersion, "networking.k8s.io/v1");
});

test("the patched Ingress uses only networking.k8s.io/v1 fields", async () => {
  const root = await repository({ "manifests/ingress.yaml": await readFile(join(fixtures, "before.yaml"), "utf8") });
  const { patches } = await plan(root);
  await apply(root, patches);
  const after = await readFile(join(root, "manifests", "ingress.yaml"), "utf8");
  const document = firstDocument(after);
  const spec = document.spec as Record<string, unknown>;

  assert.deepEqual(spec.defaultBackend, { service: { name: "default-svc", port: { number: 8080 } } });
  assert.equal(spec.backend, undefined, "the renamed field must not survive");
  assert.ok(!after.includes("serviceName") && !after.includes("servicePort"), "the v1beta1 backend fields must not survive");
  const paths = (spec.rules as { http?: { paths?: Record<string, unknown>[] } }[])
    .flatMap((rule) => rule.http?.paths ?? []);
  assert.equal(paths.length, 3);
  assert.deepEqual(paths.map((path) => path.pathType), ["ImplementationSpecific", "Prefix", "ImplementationSpecific"]);
  assert.deepEqual(paths[1]!.backend, { service: { name: "shop-api", port: { number: 9000 } } });
  // The other document of the file is a Service, and its own `port` and `targetPort` fields are not Ingress fields.
  assert.ok(after.includes("targetPort: http"), "an untouched document keeps its lines");
});

test("a second pass has nothing to do", async () => {
  const before = await readFile(join(fixtures, "before.yaml"), "utf8");
  const root = await repository({ "manifests/ingress.yaml": before });
  const { patches } = await plan(root);
  await apply(root, patches);

  const rescan = await scanRepository(root, detectors);
  assert.deepEqual(rescan.findings, [], "a v1 Ingress is not a finding");
  assert.deepEqual(await kubernetesIngressV1Fixer.plan(rescan), []);
});

test("rewrites a named port and a default backend written on a path with no path key", async () => {
  const root = await repository({
    "ingress.yaml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    serviceName: default-svc # the fallback
    servicePort: metrics
  rules:
  - http:
      paths:
      - backend:
          serviceName: catchall
          servicePort: 8080
`,
  });
  const { patches, refusals } = await plan(root);

  assert.deepEqual(refusals, []);
  await apply(root, patches);
  assert.equal(
    await readFile(join(root, "ingress.yaml"), "utf8"),
    `apiVersion: networking.k8s.io/v1
kind: Ingress
spec:
  defaultBackend:
    service:
      name: default-svc # the fallback
      port:
        name: metrics
  rules:
  - http:
      paths:
      - pathType: ImplementationSpecific
        backend:
          service:
            name: catchall
            port:
              number: 8080
`,
  );
});

test("refuses a Helm template, an anchor, a flow mapping, a resource backend, and inconsistent indentation", async () => {
  const root = await repository({
    "helm.yml": `apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: {{ .Release.Name }}
spec:
  backend:
    serviceName: web
    servicePort: 80
`,
    "anchor.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend: &default
    serviceName: web
    servicePort: 80
`,
    "flow.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend: {serviceName: web, servicePort: 80}
`,
    "charts/templates/action.yml": `apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: {{ include "charts.fullname" . }}
spec:
  backend:
    serviceName: web
    servicePort: 80
`,
    "resource.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    resource: persistentvolume-claim
`,
    "tabs.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n\t  # tab-indented comment\n  backend:\n    serviceName: web\n    servicePort: 80\n",
  });
  const { patches, refusals } = await plan(root);

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals.map((refusal) => [refusal.path, refusal.reason]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["anchor.yml", "The Ingress uses a YAML anchor or alias."],
      ["charts/templates/action.yml", "The Ingress is a Helm template, which Evergreen does not render."],
      ["flow.yml", "The `spec.backend` is written in flow style."],
      ["helm.yml", "The Ingress is a Helm template, which Evergreen does not render."],
      ["resource.yml", "The backend points at a `resource`, which has no v1 equivalent."],
      ["tabs.yml", "The document is not indented with consistent spaces."],
    ],
  );
});

test("refuses an alias, a third backend field, a non-adjacent pair, an unusual port, and an unknown path field", async () => {
  const root = await repository({
    "alias.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nbase:\n  serviceName: web\nspec:\n  backend:\n    <<: *base\n    servicePort: 80\n",
    "extra.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    serviceName: web
    servicePort: 80
    extra: kept
`,
    "apart.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    serviceName: web

    servicePort: 80
`,
    "quoted.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    serviceName: web
    servicePort: "80"
`,
    "range.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    serviceName: web
    servicePort: 70000
`,
    "name.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    serviceName: web
    servicePort: WEB
`,
    "pathfield.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  rules:
  - http:
      paths:
      - path: /
        extra: kept
        backend:
          serviceName: web
          servicePort: 80
`,
    "nobackend.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  rules:
  - http:
      paths:
      - path: /
`,
  });
  const { patches, refusals } = await plan(root);

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals.map((refusal) => [refusal.path, refusal.reason]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["apart.yml", "The `serviceName` and the `servicePort` are not on adjacent lines."],
      ["extra.yml", "The backend has a field this rewrite does not handle."],
      ["name.yml", "The `servicePort` is neither a port number nor a port name."],
      ["nobackend.yml", "The path has no backend to rewrite."],
      ["pathfield.yml", "The path has a field this rewrite does not handle."],
      ["quoted.yml", "The `servicePort` is quoted, so its number and its name are not distinguishable."],
      ["range.yml", "The `servicePort` is outside the range of a port number."],
    ],
  );

  // The Kubernetes detector never flags a manifest whose document reads an alias, so this refusal is proven against
  // a finding handed to the fixer directly.
  const aliasRefusals: Refusal[] = [];
  assert.deepEqual(await kubernetesIngressV1Fixer.plan(manualScan(root, [finding("alias.yml", 1)]), (item, reason) => {
    aliasRefusals.push({ path: item.location.path, line: item.location.line, reason });
  }), []);
  assert.deepEqual(aliasRefusals.map((refusal) => [refusal.path, refusal.reason]), [["alias.yml", "The Ingress uses a YAML anchor or alias."]]);
});

test("refuses a manifest that is not YAML, has no document at the line, or is unreadable", async () => {
  const root = await repository({
    "broken.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend: {unclosed\n",
    "service.yml": "apiVersion: extensions/v1beta1\nkind: Service\nspec:\n  ports:\n  - port: 80\n",
    "list.yml": "---\n- apiVersion: extensions/v1beta1\n  kind: Ingress\n",
  });
  const result = manualScan(root, [finding("broken.yml", 1), finding("service.yml", 1), finding("list.yml", 2), finding("gone.yml", 1), finding("service.yml", undefined)]);
  const refusals: Refusal[] = [];
  const patches = await kubernetesIngressV1Fixer.plan(result, (item, reason) => {
    refusals.push({ path: item.location.path, line: item.location.line, reason });
  });

  assert.deepEqual(patches, []);
  assert.deepEqual(refusals.map((refusal) => [refusal.path, refusal.reason]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))), [
    ["broken.yml", "The manifest is not valid YAML."],
    ["gone.yml", "The manifest could not be read."],
    ["list.yml", "The line no longer holds the `apiVersion` of a legacy Ingress."],
    ["service.yml", "The finding names no line to rewrite."],
    ["service.yml", "The line no longer holds the `apiVersion` of a legacy Ingress."],
  ]);
});

test("refuses a path outside the repository and a manifest without a trailing newline", async () => {
  const root = await repository({ "plain.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    serviceName: web\n    servicePort: 80" });
  const result = manualScan(root, [finding("../outside.yml", 1), finding("plain.yml", 1), finding("spec:/../../escaped.yml", 1)]);
  const refusals: Refusal[] = [];
  const patches = await kubernetesIngressV1Fixer.plan(result, (item, reason) => {
    refusals.push({ path: item.location.path, line: item.location.line, reason });
  });

  assert.deepEqual(patches, []);
  assert.deepEqual(refusals.map((refusal) => refusal.reason), [
    "The path resolves outside the repository.",
    "The manifest does not end with a newline.",
    "The path resolves outside the repository.",
  ]);
});

test("only one fixer patches an Ingress: the apiVersion fixer declines it and the codemod rewrites it", async () => {
  const root = await repository({
    "manifests/mixed.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  rules:
  - http:
      paths:
      - path: /
        backend:
          serviceName: web
          servicePort: 80
---
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: nightly
spec:
  schedule: "0 3 * * *"
`,
  });
  const { result } = await plan(root);
  const apiVersionPatches = await kubernetesApiVersionFixer.plan(result);
  const { patches, refusals } = await planFixReport(result, [kubernetesApiVersionFixer, kubernetesIngressV1Fixer]);

  // The apiVersion fixer declines the Ingress finding, so it never moves that line; only the CronJob is its business.
  assert.deepEqual(apiVersionPatches.map((patch) => patch.path), ["manifests/mixed.yml"]);
  assert.ok(!apiVersionPatches[0]!.diff.includes("+apiVersion: networking.k8s.io/v1"), "the apiVersion fixer does not touch the Ingress");
  assert.deepEqual(
    refusals.filter((refusal) => refusal.fixer === "kubernetes").map((refusal) => refusal.reason),
    ["The replacement needs a spec change, not only an `apiVersion` rewrite."],
  );
  assert.deepEqual(
    patches.filter((patch) => patch.path === "manifests/mixed.yml").map((patch) => patch.fixer),
    ["kubernetes", "kubernetes-ingress-v1"],
    "the two Kubernetes fixers split the file by object, not by rule"
  );
  const added = patches.flatMap((patch) => patch.diff.split("\n")).filter((line) => line.startsWith("+apiVersion: "));
  assert.deepEqual(added, ["+apiVersion: batch/v1", "+apiVersion: networking.k8s.io/v1"], "each object's apiVersion moves once");
});

test("ignores findings from other detectors and from the IngressClass rule", async () => {
  const root = await repository({ "ingress.yml": ingress });
  const other = finding("ingress.yml", 1, "kubernetes.networking-k8s-io.ingressclass.v1beta1.removed");
  const npm = { ...finding("package.json", 1), detector: "npm" as const };
  const { patches, refusals } = await plan(root);
  assert.equal(patches.length, 1);
  assert.deepEqual(refusals, [], "the plain Ingress is rewritten, not declined");

  const ignored = await kubernetesIngressV1Fixer.plan(manualScan(root, [other, npm]));
  assert.deepEqual(ignored, [], "a rule the codemod does not own is left to its own fixer");
});

/** Plans the codemod over the given findings, so each refusal is reached by the line it names. */
async function refuseFindings(root: string, findings: Finding[]): Promise<{ patches: Awaited<ReturnType<typeof kubernetesIngressV1Fixer.plan>>; refusals: Refusal[] }> {
  const refusals: Refusal[] = [];
  const patches = await kubernetesIngressV1Fixer.plan(manualScan(root, findings), (item, reason) => {
    refusals.push({ path: item.location.path, line: item.location.line, reason });
  });
  return { patches, refusals };
}

test("refuses a document that contains `{{` in a comment, which Evergreen reads as a Helm template", async () => {
  const root = await repository({
    "comment.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\n# chart: {{ .Chart.Name }}\nspec:\n  backend:\n    serviceName: web\n    servicePort: 80\n",
  });
  const { patches, refusals } = await refuseFindings(root, [finding("comment.yml", 1)]);

  assert.deepEqual(patches, []);
  assert.deepEqual(refusals, [{ path: "comment.yml", line: 1, reason: "The Ingress is a Helm template, which Evergreen does not render." }]);
});

test("refuses a backend, spec, rules, http, paths, rule, or path written in flow style", async () => {
  const root = await repository({
    "flow-spec.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec: {backend: {serviceName: web, servicePort: 80}}\n",
    "flow-rules.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules: [{host: example.com}]\n",
    "flow-rule.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - {http: {paths: []}}\n",
    "flow-http.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http: {paths: []}\n",
    "flow-paths.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http:\n      paths: [{path: /}]\n",
    "flow-path.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http:\n      paths:\n      - {path: /}\n",
    "flow-pathbackend.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http:\n      paths:\n      - path: /\n        backend: {serviceName: web, servicePort: 80}\n",
  });
  const findings = ["flow-spec.yml", "flow-rules.yml", "flow-rule.yml", "flow-http.yml", "flow-paths.yml", "flow-path.yml", "flow-pathbackend.yml"].map((path) => finding(path, 1));
  const { patches, refusals } = await refuseFindings(root, findings);

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals.map((refusal) => [refusal.path, refusal.reason]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["flow-http.yml", "The `http` is written in flow style."],
      ["flow-path.yml", "The path is written in flow style."],
      ["flow-pathbackend.yml", "The backend is written in flow style."],
      ["flow-paths.yml", "The `paths` is written in flow style."],
      ["flow-rule.yml", "The rule is written in flow style."],
      ["flow-rules.yml", "The `spec.rules` is written in flow style."],
      ["flow-spec.yml", "The `spec` is written in flow style."],
    ],
  );
});

test("refuses a spec, rules, rule, http, paths, path, or backend that is the wrong kind of block", async () => {
  const root = await repository({
    "scalar-spec.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec: web\n",
    "scalar-backend.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend: web\n",
    "scalar-rules.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules: web\n",
    "scalar-rule.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - web\n",
    "scalar-http.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http: web\n",
    "scalar-paths.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http:\n      paths: web\n",
    "scalar-path.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http:\n      paths:\n      - web\n",
    "scalar-pathbackend.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http:\n      paths:\n      - path: /\n        backend: web\n",
  });
  const findings = [
    "scalar-spec.yml",
    "scalar-backend.yml",
    "scalar-rules.yml",
    "scalar-rule.yml",
    "scalar-http.yml",
    "scalar-paths.yml",
    "scalar-path.yml",
    "scalar-pathbackend.yml",
  ].map((path) => finding(path, 1));
  const { patches, refusals } = await refuseFindings(root, findings);

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals.map((refusal) => [refusal.path, refusal.reason]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["scalar-backend.yml", "The `spec.backend` is not a block mapping."],
      ["scalar-http.yml", "The `http` is not a block mapping."],
      ["scalar-path.yml", "The path is not a block mapping."],
      ["scalar-pathbackend.yml", "The backend is not a block mapping."],
      ["scalar-paths.yml", "The `paths` is not a block sequence."],
      ["scalar-rule.yml", "The rule is not a block mapping."],
      ["scalar-rules.yml", "The `spec.rules` is not a block sequence."],
      ["scalar-spec.yml", "The `spec` is not a block mapping."],
    ],
  );
});

test("refuses a backend whose name or port is not one line, or whose fields are not the pair", async () => {
  const root = await repository({
    "block-name.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    serviceName: |-\n      web\n    servicePort: 80\n",
    "empty-name.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    serviceName: \"\"\n    servicePort: 80\n",
    "wrapped-name.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    serviceName: web\n      api\n    servicePort: 80\n",
    "block-port.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    serviceName: web\n    servicePort: |-\n      80\n",
    "unpaired.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    foo: web\n    bar: 80\n",
  });
  const findings = ["block-name.yml", "empty-name.yml", "wrapped-name.yml", "block-port.yml", "unpaired.yml"].map((path) => finding(path, 1));
  const { patches, refusals } = await refuseFindings(root, findings);

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals.map((refusal) => [refusal.path, refusal.reason]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["block-name.yml", "The `serviceName` value is not written on one line."],
      ["block-port.yml", "The `servicePort` value is not written on one line."],
      ["empty-name.yml", "The `serviceName` value is not written on one line."],
      ["unpaired.yml", "The backend does not pair `serviceName` with `servicePort`."],
      ["wrapped-name.yml", "The `serviceName` value is not written on one line."],
    ],
  );
});

test("refuses a path with a key that is not text, and a scalar name that is neither text nor a number", async () => {
  const root = await repository({
    "numeric-key.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - http:\n      paths:\n      - path: /\n        1: kept\n        backend:\n          serviceName: web\n          servicePort: 80\n",
    "boolean-name.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    serviceName: true\n    servicePort: 80\n",
  });
  const { patches, refusals } = await refuseFindings(root, [finding("numeric-key.yml", 1), finding("boolean-name.yml", 1)]);

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals.map((refusal) => [refusal.path, refusal.reason]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["boolean-name.yml", "The `serviceName` value is not written on one line."],
      ["numeric-key.yml", "The path has a field this rewrite does not handle."],
    ],
  );
});

test("refuses a broken template with `{{` as a Helm template, not as a YAML error", async () => {
  const root = await repository({
    "broken-template.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\n{{- if .Values.enabled }}\nspec:\n  backend: {unclosed\n",
  });
  const { patches, refusals } = await refuseFindings(root, [finding("broken-template.yml", 1)]);

  assert.deepEqual(patches, []);
  assert.deepEqual(refusals, [{ path: "broken-template.yml", line: 1, reason: "The Ingress is a Helm template, which Evergreen does not render." }]);
});

test("refuses a manifest larger than Evergreen reads and one with more documents than it rewrites", async () => {
  const root = await repository({
    "large.yml": `apiVersion: extensions/v1beta1\nkind: Ingress\n# ${"a".repeat(MAXIMUM_INPUT_BYTES)}\n`,
    "many.yml": `apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    serviceName: web\n    servicePort: 80\n${"---\nkind: ConfigMap\n".repeat(MAXIMUM_DOCUMENTS)}`,
  });
  const { patches, refusals } = await refuseFindings(root, [finding("large.yml", 1), finding("many.yml", 1)]);

  assert.deepEqual(patches, []);
  assert.deepEqual(refusals.map((refusal) => [refusal.path, refusal.reason]), [
    ["large.yml", "The manifest is larger than Evergreen reads."],
    ["many.yml", "The manifest has more documents than Evergreen rewrites."],
  ]);
});

test("rewrites each legacy Ingress in a file and skips a document whose apiVersion is not a scalar", async () => {
  const root = await repository({
    "two.yml": `apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    serviceName: web
    servicePort: 80
---
metadata:
  name: no-kind
---
kind: Ingress
apiVersion: [a, b]
---
apiVersion: extensions/v1beta1
kind: Ingress
spec:
  backend:
    serviceName: api
    servicePort: 80
`,
  });
  const { patches, refusals } = await refuseFindings(root, [finding("two.yml", 1), finding("two.yml", 14)]);

  assert.deepEqual(refusals, []);
  assert.equal(patches.length, 1);
  await apply(root, patches);
  assert.equal(
    await readFile(join(root, "two.yml"), "utf8"),
    `apiVersion: networking.k8s.io/v1
kind: Ingress
spec:
  defaultBackend:
    service:
      name: web
      port:
        number: 80
---
metadata:
  name: no-kind
---
kind: Ingress
apiVersion: [a, b]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
spec:
  defaultBackend:
    service:
      name: api
      port:
        number: 80
`,
  );
});

test("rewrites an Ingress with no spec, with a backend but no rules, or with rules that carry no paths", async () => {
  const root = await repository({
    "bare.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nmetadata:\n  name: bare\n",
    "norules.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  backend:\n    serviceName: web\n    servicePort: 80\n",
    "nopaths.yml": "apiVersion: extensions/v1beta1\nkind: Ingress\nspec:\n  rules:\n  - host: example.com\n  - http:\n      other: kept\n",
  });
  const { patches, refusals } = await refuseFindings(root, [finding("bare.yml", 1), finding("norules.yml", 1), finding("nopaths.yml", 1)]);

  assert.deepEqual(refusals, []);
  await apply(root, patches);
  assert.equal(
    await readFile(join(root, "bare.yml"), "utf8"),
    "apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: bare\n",
  );
  assert.equal(
    await readFile(join(root, "norules.yml"), "utf8"),
    "apiVersion: networking.k8s.io/v1\nkind: Ingress\nspec:\n  defaultBackend:\n    service:\n      name: web\n      port:\n        number: 80\n",
  );
  assert.equal(
    await readFile(join(root, "nopaths.yml"), "utf8"),
    "apiVersion: networking.k8s.io/v1\nkind: Ingress\nspec:\n  rules:\n  - host: example.com\n  - http:\n      other: kept\n",
  );
});

test("keeps the quotes of a quoted apiVersion, serviceName, and backend key", async () => {
  const root = await repository({
    "quoted.yml": `apiVersion: "extensions/v1beta1"
kind: Ingress
spec:
  "backend":
    serviceName: "web"
    servicePort: 80
`,
  });
  const { patches, refusals } = await refuseFindings(root, [finding("quoted.yml", 1)]);

  assert.deepEqual(refusals, []);
  await apply(root, patches);
  assert.equal(
    await readFile(join(root, "quoted.yml"), "utf8"),
    `apiVersion: "networking.k8s.io/v1"
kind: Ingress
spec:
  "defaultBackend":
    service:
      name: "web"
      port:
        number: 80
`,
  );
});
