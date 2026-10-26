# Kubernetes fixtures

These fixtures define the parser boundary for Kubernetes API declarations (see
[decision 0008](../../../docs/decisions/0008-kubernetes-detector.md)). Parsers
return exact one-based line numbers, ignore dynamic or unsupported forms, and
never throw for malformed input. Each folder is a small repository root.

A parser returns every literal declaration it can read, including a supported
`apiVersion`; whether a declaration is a finding is decided later by the registry.
The negative and zero cases therefore say what the parser must **not** return, and
what the finished detector must not report.

| Fixture | Expected case |
| --- | --- |
| `positive/manifests/web.yaml` | Three documents separated by `---`: a legacy `extensions/v1beta1` Ingress, a supported `apps/v1` Deployment, and a legacy `batch/v1beta1` CronJob. A comment on line 1 is skipped and line numbers count it. |
| `positive/manifests/dump.yaml` | A `kubectl get -o yaml` dump export (`kind: List`) containing the same three objects as `web.yaml` inside its `items[]` list. |
| `positive/manifests/psp.yml` | The `.yml` extension, `kind` before `apiVersion`, and a double-quoted `apiVersion` value. |
| `positive/helm/mychart/Chart.yaml` | A `kubeVersion` constraint and a dependency on the retired Helm stable repository. The chart's own `apiVersion: v2` is the Helm chart format, not a Kubernetes API. |
| `positive/helm/mychart/templates/ingress.yaml` | A literal `apiVersion` and `kind` inside an `{{- if .Values... }}` block; a value condition does not make the declaration dynamic. |
| `positive/helm/mychart/templates/cronjob.yml` | A literal legacy `apiVersion` in a `.yml` template with template actions elsewhere in the file. |
| `positive/helm/mychart/values.yaml` | A chart file that is not a manifest and is never read as one. |
| `positive/kustomize/kustomization.yaml` | `resources` (a file and a directory), a JSON 6902 patch whose `target` names `group`, `version`, and `kind`, and an inline strategic-merge patch with its own `apiVersion` and `kind`. The file's own `kustomize.config.k8s.io/v1beta1` is the current Kustomization API and is not a declaration to judge. |
| `positive/kustomize/ingress.yaml` | A plain manifest referenced from the kustomization. |
| `negative/manifests/lookalikes.yaml` | A commented declaration, `ownerReferences` with a nested `apiVersion`, a block-scalar string that contains a manifest, `apiVersion` without `kind`, `kind` without `apiVersion`, a YAML alias, a CRD whose `names.kind` and version name look like an API, and a `kind: List` whose `items` are not read. |
| `negative/helm/mychart/Chart.yaml` | A commented `kubeVersion`, a `kubeVersion` that is not a top-level key, a dependency whose name is a template action, and a repository alias (`@stable`). |
| `negative/helm/mychart/templates/ingress.yaml` | A declaration inside an `if .Capabilities.APIVersions.Has` ladder: the legacy branches exist for old clusters and are not reported. |
| `negative/helm/mychart/templates/dynamic.yaml` | A template comment, a YAML comment, and `apiVersion`/`kind` taken from `.Values` or a helper. |
| `negative/helm/mychart/templates/_helpers.tpl` | A `define` that prints a legacy manifest; `.tpl` files are not read. |
| `negative/kustomize/kustomization.yaml` | Commented resources, a remote URL, a `$(VAR)` path, and `apiVersion`/`kind` under `commonLabels`. |
| `zero/manifests/app.yaml` | Only supported APIs (`apps/v1`, `networking.k8s.io/v1`, `batch/v1`): no findings. |
| `zero/helm/mychart/` | A chart with a Bitnami dependency and a supported template: no findings. |
| `zero/kustomize/` | A kustomization that references a supported manifest: no findings. |
| `malformed/manifests/broken.yaml` | A valid first document followed by a broken one. A file with any syntax error yields no declarations, including from the valid document. |
| `malformed/manifests/tab.yaml` | A tab used for indentation. |
| `malformed/manifests/nul-byte.yaml` | A NUL byte inside the file. |
| `malformed/helm/mychart/Chart.yaml` | An unclosed flow sequence. |
| `malformed/helm/mychart/templates/cronjob.yaml` | Unclosed template actions. |
| `malformed/kustomize/kustomization.yaml` | An unclosed flow sequence and a truncated inline patch. |

The malformed files are written with `printf` so the tab, the NUL byte, and the
missing final lines stay exactly as shown; do not reformat them.
