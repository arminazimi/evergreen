{% raw %}
# 0008 — Detect removed and deprecated Kubernetes APIs in manifests, Helm charts, and kustomizations

Status: accepted

Evergreen will add a `kubernetes` detector that reads the `apiVersion` and `kind` of Kubernetes objects declared in repository files and reports the ones the Kubernetes project has documented as deprecated or no longer served. It follows the existing [detector SDK](../DETECTORS.md) and the [v2 registry](0004-registry-v2.md); it adds no new engine behavior and no new VERS scheme.

## What the detector reads

| Declaration | Files | Deterministic? |
| --- | --- | --- |
| top-level `apiVersion` and `kind` of each document | `*.yaml`, `*.yml` outside a Helm chart's `templates/` directory | Yes, when both are literal scalars in the same document |
| the same, in a file that contains `{{` outside a chart | `*.yaml`, `*.yml` | Read as a template, not as plain YAML, so a cluster-guarded declaration is not reported |
| `kubeVersion` | `Chart.yaml` | Read and carried as evidence; not judged (see below) |
| top-level `apiVersion` and `kind` of each document | `*.yaml`, `*.yml` directly in a chart's `templates/` directory | Yes, when both are literal and not guarded by a capability check |
| `resources` entries | `kustomization.yaml`, `kustomization.yml`, `Kustomization` | Read as local paths; the referenced files are read as manifests |
| inline patch with its own `apiVersion` and `kind` | same, under `patches` and `patchesStrategicMerge` | Yes, when both are literal |
| JSON 6902 patch `target` with `group`, `version`, and `kind` | same, under `patches` | Yes, when all three are literal |

A **document** is one `---`-separated YAML document. The pair is read from the document's **top level only**: `ownerReferences[].apiVersion`, `involvedObject`, CRD `spec.names.kind`, and CRD `spec.versions[].name` are not declarations. A document with only one of the two keys is not a declaration. The `apiVersion` is split into `group` and `version` at the last `/`; a value with no `/` is the core group.

A file is read as a manifest only when it has the pair above; every other YAML file (CI workflows, `values.yaml`, Compose files) produces nothing and costs one bounded parse.

## How a declaration maps to a rule

A Kubernetes API is identified by **group, version, and kind**. Lifecycle is a property of that triple, so one rule covers one group and kind, and VERS carries the API version.

- **PURL:** `pkg:generic/kubernetes/<group>/<Kind>`, for example `pkg:generic/kubernetes/extensions/Ingress` and `pkg:generic/kubernetes/flowcontrol.apiserver.k8s.io/FlowSchema`. The group is lower case exactly as in `apiVersion`; the kind keeps its case. The core group has no deprecated kinds in the migration guide, so it has no form yet.
- **VERS:** the `semver` scheme, with the API version translated by a fixed rule: `vN` is `N.0.0`, `vNalphaM` is `N.0.0-alpha.M`, and `vNbetaM` is `N.0.0-beta.M`. `v1beta1` becomes `1.0.0-beta.1`, `v2beta2` becomes `2.0.0-beta.2`, `v1` becomes `1.0.0`. This preserves Kubernetes' own maturity order (alpha, then beta, then stable) and needs no new scheme or change to `src/vers.ts`. An `apiVersion` that does not fit `vN`, `vNalphaM`, or `vNbetaM` is not translated and is not classified.
- A rule names the **exact** API version (`vers:semver/1.0.0-beta.1`). A kind served by several beta versions gets one rule per version when the versions were removed in different releases (`autoscaling/v2beta1` and `autoscaling/v2beta2`).

## Where lifecycle facts come from

Allowed sources, each recorded in the rule's `sources` and `provenance`:

- the Kubernetes [Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/), which states, per kind, the API version that stopped being served, the release that stopped serving it, and the replacement;
- the Kubernetes [release history](https://kubernetes.io/releases/), only to turn "stopped being served in v1.25" into the date of that release, never to decide status.

The migration guide names releases, not dates. A rule's `deadline` is the release date of the release in which the version stopped being served, taken from the release history, and the rule cites both pages. A rule is written only for an API version the guide says is **no longer served** in a named release, or that it lists as deprecated with a stated removal release.

Rejected inputs, which are never used to produce a rule or a finding:

- **popularity**, or how many charts or manifests still use an API;
- **"a newer version exists"** — `apps/v1` existing does not retire `apps/v1beta1`; only the guide does;
- **vulnerability scanner output**;
- **cluster state**: which version a running cluster serves is not visible to a scan and is never assumed;
- **release support windows** as a reason to flag a manifest: the release history says which Kubernetes minors are patched, not which APIs a manifest may use.

## What is dynamic, and what happens to it

A declaration is **dynamic** when its value cannot be known without running something. Dynamic declarations produce **no finding** and no guess:

- a Helm template value: `apiVersion: {{ .Values.apiVersion }}`, `kind: {{ .Values.kind }}`, or a value produced by `include`;
- a Helm template declaration inside a block whose condition asks the cluster: `.Capabilities` (`.Capabilities.APIVersions.Has`, `.Capabilities.KubeVersion`), or a call to `include`, `template`, `tpl`, or `lookup`, which can hide the same check in a helper. The chart chooses the API by asking the cluster, and the legacy branch is the fallback for old clusters, so reporting it would be a false positive. Once one condition in an `if`/`else if`/`else` chain asks the cluster, every later branch is dynamic too, and so is everything inside a `define` or `block`. A template document with more than one `apiVersion` or `kind` line is skipped. Conditions on `.Values` do not make a declaration dynamic;
- a YAML alias or merge key as a value;
- a `kustomization` resource that is a remote URL or contains `$(`;
- a kustomize patch whose body is not a YAML mapping or a JSON 6902 operation list.

Where the engine already reports unclassified references (`ScanResult.unclassified`), a dynamic declaration is **not** reported there in the first version: with no known kind there is nothing to say was left unjudged. This is revisited with the corpus.

## What the detector does not read, or does not judge

- **`kubeVersion` in `Chart.yaml`.** It is parsed and carried as evidence so a later rule can use it, but the first version raises no finding from it. A chart that allows an old cluster is not by itself using a removed API.
- **`kind: List` and `items:`.** A `List` is a kubectl output wrapper, rarely a committed source file; its items are not read.
- **Helm `.tpl` files** (`_helpers.tpl`), `NOTES.txt`, chart `tests/`, and nested `charts/` subcharts. Only `*.yaml` and `*.yml` directly under a chart's `templates/` are templates.
- **Kustomize `components`, `bases`, `generators`, `transformers`, and remote bases.** Only `resources`, inline patches, and JSON 6902 targets are read; `bases` is the legacy form of `resources` and is not followed.
- **Helm rendering**, `kustomize build`, `kubectl`, and CRDs: nothing is rendered, expanded, or applied. Custom resources with an API group outside Kubernetes' own are never matched because no rule names them.
- **Deprecation without removal.** A version the guide lists as deprecated but not yet removed is reported only when the guide states the release that will remove it.
- **Release-line EOL of Kubernetes itself.** Not covered in this version.

The kustomization's own `apiVersion: kustomize.config.k8s.io/v1beta1` is the current Kustomization API and has no rule.

## Where it looks

The detector walks the repository (eight directories deep, at most 2,000 matching files, never following symbolic links) and skips dependency, build, and test-fixture directories: `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, `testdata`, and a chart's nested `charts/`. A directory containing `Chart.yaml` is a chart; a directory containing a kustomization file is a kustomization.

Parsers treat contents as untrusted: input over a size limit is skipped, document and nesting depth are bounded, a file with any YAML syntax error yields **no** declarations (not those of its valid documents), and nothing is evaluated.

## Examples for the fixture task

True positives (rule exists for the group, kind, and version, and the value is literal):

- `apiVersion: extensions/v1beta1` with `kind: Ingress`, and `apiVersion: batch/v1beta1` with `kind: CronJob`, in one multi-document file
- `kind: PodSecurityPolicy` before `apiVersion: "policy/v1beta1"`
- a Helm template with a literal `networking.k8s.io/v1beta1` Ingress inside `{{- if .Values.ingress.enabled }}`
- a kustomize inline patch with `apiVersion: policy/v1beta1` and `kind: PodDisruptionBudget`, and a JSON 6902 target for `batch/v1beta1` `CronJob`

Must not produce findings:

- `# apiVersion: extensions/v1beta1` and a manifest inside a block-scalar string
- `ownerReferences[].apiVersion`, a CRD whose `names.kind` is `Ingress`, a `kind: List` whose items are legacy
- `apiVersion` without `kind`, an alias, a Helm value or helper, a `.Capabilities` ladder, `_helpers.tpl`
- `apps/v1`, `networking.k8s.io/v1`, `batch/v1`

Malformed: a valid document followed by a broken one, tab indentation, a NUL byte, unclosed template actions, an unclosed flow sequence. All must produce no findings and no crash.

## Consequences

- The detector is quiet by default. Anything that depends on the cluster or on a rendered chart gets no verdict from Evergreen, which is the honest answer.
- A kind removed in different releases for different versions needs several small rules. That cost is accepted so each rule states one checkable fact.
- The version translation is a convention of Evergreen's registry, documented here and used by the detector, the importers, and the rules. It is not a general Kubernetes version scheme.
- Adding the detector means adding the scaffolded files and two registrations (`src/detectors/index.ts` and `BUNDLED_ECOSYSTEMS` in `src/data-bundle.ts`), as described in [DETECTORS.md](../DETECTORS.md).
{% endraw %}
