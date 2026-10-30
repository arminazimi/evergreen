# Inventory

`evergreen inventory` reads the JSON or text exports that cloud and cluster tools already produce and reports what they say is deployed: end-of-life runtimes, images, engines, cluster versions, and operating systems. Each result carries the importer, the file, and the exact place in the file the claim rests on, as an RFC 6901 JSON Pointer.

Evergreen never calls a cloud or cluster API. You run the export command on a machine with credentials, then give the file to `evergreen inventory`:

```bash
kubectl get deploy,sts,ds,cronjob,job,pod -A -o json > workloads.json
evergreen inventory workloads.json
```

Every importer reads one export file and produces items. The output is deterministic: results sort by file and pointer. An affected item means a lifecycle rule applies to the version the export names; `no-data` means Evergreen has no rule for that PURL, never that the thing is safe. A file no importer recognizes is listed, the run exits `2`, and the files that were recognized are still reported.

## Privacy

`inventory` reads only the files named on the command line. It makes no network request, runs no command, and reads no other file. It never executes code or tools from the scanned export. Output names only the resource's own short name: `resource` is never an account id, ARN, subscription id, project number, IP address, node name, tag, or environment variable. `--redact` replaces each resource name with the first 12 hex characters of its SHA-256, in text and JSON output alike.

## Kubernetes workloads

### What it reads

Export a cluster's workload objects:

```bash
kubectl get deploy,sts,ds,cronjob,job,pod -A -o json > workloads.json
evergreen inventory workloads.json
```

The importer recognizes a Kubernetes `List` whose items each have `apiVersion`, `kind`, and `metadata`. A list of `Node` objects is left to the cluster importer. For every item it reads:

- `apiVersion` and `kind`, mapped to the Kubernetes lifecycle rules.
- `metadata.namespace` and `metadata.name`, which form `resource` as `<namespace>/<kind>/<name>`. Cluster-scoped objects have no namespace and use `cluster` instead.
- For `Pod`, `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet`, `Job`, and `CronJob`, every `containers[].image` and `initContainers[].image` in the pod template. For a `CronJob` that is `spec.jobTemplate.spec.template`.

Images are parsed with the same parser as the container detector. Identical image references are reported once per namespace and workload, at the first pointer where they appear. A label, annotation, environment variable, pod status, and `spec.nodeName` are never read.

### Rules matched

| Item | PURL | Registry |
| --- | --- | --- |
| Container image | `pkg:docker/<repository>`, for example `pkg:docker/library/node` | `registry/container.json` |
| API version | `pkg:generic/kubernetes/<group>/<Kind>`, for example `pkg:generic/kubernetes/networking.k8s.io/Ingress` | `registry/kubernetes.json` |

A Docker Hub image is written without the registry: `docker.io/library/node` is `pkg:docker/library/node`. Images from other registries are skipped, not reported, because no rule covers them yet and a private registry host can carry an account id.

An image tag is used as the version only when it is a plain release number: `node:18.19.0` is `18.19.0`, and `node:18` is `18.0.0`. Floating tags such as `latest`, `22-alpine`, or a digest with no tag name no version, so the item is reported as `version-dependent`, not guessed. An API version is translated to the rule's semver form by the same rule as the Kubernetes detector (decision 0008): `v1` is `1.0.0`, `v1beta1` is `1.0.0-beta.1`, and `v2beta2` is `2.0.0-beta.2`.

### Limit: the API server's preferred version

`kubectl get -o json` reports each object at a version the API server chooses to serve, not necessarily the version it was stored or applied at. An object created through a removed API can therefore appear at its replacement: an `Ingress` applied as `networking.k8s.io/v1beta1` is reported by a modern server as `networking.k8s.io/v1`. This importer can only judge the version the export names; it cannot infer an older stored version. Use a manifest scan to judge what the repository declares.

### What it does not judge

- Images from registries other than Docker Hub, including private registries and IP-address hosts: no rule covers them yet, so they are skipped rather than reported and no host, address, or account id reaches the output.
- Floating tags and digest-only references, whose release line the file does not name.
- The core API group (`apiVersion: v1`, such as `Pod`), which has no removed kinds in the Kubernetes migration guide.
- Objects and fields beyond the ones listed above.

The fixtures under `tests/fixtures/inventory/k8s-workloads/` reproduce the documented output shape of `kubectl get … -o json` (kubectl 1.31), with every identifier replaced by a placeholder. They were assembled from the command's output shape, not captured from a live cluster.
