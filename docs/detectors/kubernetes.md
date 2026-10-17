# Kubernetes APIs

The `kubernetes` detector reports API versions that the Kubernetes project says are no longer served, as declared in manifests, Helm chart templates, and kustomizations. It is **experimental**: it is scored on the [public corpus](../VALIDATION.md) but not yet held to the precision floor that stable detectors are. The reasoning is in [Decision 0008](../decisions/0008-kubernetes-detector.md).

## What it reads

| File | Declaration |
| --- | --- |
| `*.yaml`, `*.yml` | the top-level `apiVersion` and `kind` of each `---`-separated document, when both are literal |
| `templates/*.yaml`, `templates/*.yml` in a Helm chart (a directory with `Chart.yaml`), and any YAML file that contains `{{` | the same pair, read as text without rendering the template |
| `kustomization.yaml`, `kustomization.yml`, `Kustomization` | an inline patch (a block scalar) with its own `apiVersion` and `kind`, and a patch `target` with `group`, `version`, and `kind` |

It walks the repository up to eight directories deep (at most 2,000 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, `testdata`, and a chart's nested `charts/`. Files over 1 MiB are skipped. Nothing is rendered, built, or applied, and the Kubernetes tools are never run.

## What it reports

A declaration whose group, kind, and API version match a rule in `registry/kubernetes.json`. The rules today are:

| API version | Kind | No longer served as of |
| --- | --- | --- |
| `extensions/v1beta1` | Ingress | v1.22 |
| `networking.k8s.io/v1beta1` | Ingress | v1.22 |
| `batch/v1beta1` | CronJob | v1.25 |
| `policy/v1beta1` | PodSecurityPolicy | v1.25 |
| `autoscaling/v2beta2` | HorizontalPodAutoscaler | v1.26 |

Each finding carries its rule's sources, the replacement, migration steps, and suggested verification commands (`kubeconform -strict`, `kubectl apply --dry-run=server`). The rule's deadline is the date of the release announcement for the release that stopped serving the API; the Kubernetes migration guide names the release but not a date.

## What it intentionally does not judge

These produce no finding and are not guessed:

- values from Helm (`{{ .Values.apiVersion }}`) or from a helper (`include`, `template`, `tpl`, `lookup`);
- a declaration inside a Helm block whose condition asks the cluster (`.Capabilities`), or after such a condition in an `if`/`else` chain, or inside `define` or `block`. Charts use these to keep a legacy API for old clusters, so reporting the legacy branch would be a false positive;
- a document with a YAML alias, or a file with any syntax error (nothing from the file is reported, including its valid documents);
- `kind: List` items, `ownerReferences`, CRD `names.kind` and version names, and anything below the top level of a document;
- an API version outside the `vN`, `vNalphaM`, or `vNbetaM` form;
- remote or `$(VAR)` kustomize resources, `bases`, `components`, generators, and transformers;
- Helm `.tpl` files, `NOTES.txt`, chart `tests/`, and `kubeVersion` in `Chart.yaml` (it is read but no rule uses it yet).

## Known limits and false-positive boundaries

- Only the five API versions above have rules. An API version the migration guide lists but this registry does not is not reported; the `kubernetes-1` [importer](../IMPORTERS.md) drafts the others for review.
- A manifest kept on an old API version **on purpose**, for example for a cluster that still serves it, is still reported. The rule states what the Kubernetes project says about the API; whether the target cluster is old is for the repository to decide, for example with a [baseline](../../README.md).
- A literal declaration in a Helm template that is only used when a `.Values` flag is on is reported, because the flag is a repository value and Evergreen does not evaluate it.
- Custom resources are never matched: no rule names an API group outside Kubernetes' own.
- Kubernetes release lines reaching end of life are not judged. The `kubernetes-2` importer drafts rules for them, but no detector reads them yet.

## Data

The rules are in `registry/kubernetes.json` and ship in the [data bundle](../DATA.md). Each links the Kubernetes Deprecated API Migration Guide and the release announcement that dates it. The `kubernetes-1` and `kubernetes-2` [importers](../IMPORTERS.md) read the migration guide and the release history.

## Validation

The corpus entries for this detector are tracked in [Validation](../VALIDATION.md); until they are added the detector is scored only on its own fixtures.
