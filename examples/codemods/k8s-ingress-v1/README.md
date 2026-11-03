# Kubernetes Ingress v1 codemod

The `before.yaml` manifest uses the Ingress API removed in Kubernetes v1.22:

- `apiVersion: extensions/v1beta1`, which the API server no longer serves.
- `spec.backend`, which `networking.k8s.io/v1` names `spec.defaultBackend`.
- `serviceName` and `servicePort`, which become `service.name` and `service.port.number` or `service.port.name`.
- A path with no `pathType`, which v1 requires; `ImplementationSpecific` keeps the matching v1beta1 did.

`evergreen fix` rewrites all four to `after.yaml`. Only the affected lines change, so the `metadata`, the
`kubernetes.io/ingress.class` annotation, and the key order of everything else are kept as they were written.

```bash
cp examples/codemods/k8s-ingress-v1/before.yaml ingress.yaml
evergreen scan . --only kubernetes
evergreen fix . | git apply --check
evergreen fix . | git apply
kubectl apply --dry-run=server -f ingress.yaml
```

A Helm template, a YAML anchor or alias, a flow-style mapping, a `resource:` backend, a backend whose
two fields are not adjacent, a quoted or out-of-range `servicePort`, and tab indentation are refused with
the reason. `docs/CODEMODS.md` describes the full set of rewrites and refusals.
