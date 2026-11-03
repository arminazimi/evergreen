# Inventory

`evergreen inventory` reads the JSON or text exports that cloud and cluster tools already produce and reports what they say is deployed: end-of-life runtimes, images, engines, cluster versions, and operating systems. Each result carries the importer, the file, and the exact place in the file the claim rests on, as an RFC 6901 JSON Pointer.

Evergreen never calls a cloud or cluster API. You run the export command on a machine with credentials, then give the file to `evergreen inventory`:

```bash
kubectl get deploy,sts,ds,cronjob,job,pod -A -o json > workloads.json
evergreen inventory workloads.json
```

Every importer reads one export file and produces items. The output is deterministic: results sort by file and pointer. An affected item means a lifecycle rule applies to the version the export names; `no-data` means Evergreen has no rule for that PURL, never that the thing is safe. A file no importer recognizes is listed, the run exits `2`, and the files that were recognized are still reported.

## Privacy

`inventory` reads only the files named on the command line. It makes no network request, runs no command, and reads no other file. It never executes code or tools from the scanned export. Output names only the resource's own short name: `resource` is never an account id, ARN, subscription id, project number, IP address, tag, or environment variable, and the one exception is a Kubernetes node's own name, which the cluster importer reports because the node is the resource (a node named by its IP address is skipped). `--redact` replaces each resource name with the first 12 hex characters of its SHA-256, in text and JSON output alike.

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

## Kubernetes cluster

Export the cluster's version and its nodes, then pass both files:

```bash
kubectl version -o json > k8s-cluster.json
kubectl get nodes -o json > k8s-nodes.json
evergreen inventory k8s-cluster.json k8s-nodes.json
```

The importer recognizes the version export, the object that carries `serverVersion.gitVersion`, and the node export, a Kubernetes `List` whose items are all `Node` objects with `status.nodeInfo`. From the version export it reads the control-plane version; from the node export it reads, per node:

- `status.nodeInfo.kubeletVersion`
- `status.nodeInfo.osImage`
- `status.nodeInfo.containerRuntimeVersion`
- `metadata.name`, which becomes `resource`

### Provider suffixes

`gitVersion` and `kubeletVersion` carry a provider suffix on managed services: `v1.28.3-eks-2fbdaf5`, `v1.30.5-gke.1445001`, `v1.31.5+k3s1`. Everything from the first `-` or `+` is stripped and the upstream release is judged, so each of those is `1.28.3`, `1.30.5`, and `1.31.5`. Managed providers (EKS, GKE, AKS) retire minors on their own calendars, which end earlier than upstream's, so a managed cluster should be judged by its provider's schedule too: the provider view is covered by the EKS, Google Cloud, and Azure tasks, and GKE already has its own rules in `registry/kubernetes.json`.

### Rules matched

| Item | PURL | Registry |
| --- | --- | --- |
| Control plane, kubelet | `pkg:generic/kubernetes` | `registry/kubernetes.json` |
| Node OS image | `pkg:generic/<distribution>`, for example `pkg:generic/ubuntu` | `registry/container.json` |
| Container runtime | `pkg:generic/containerd`, `pkg:generic/docker`, `pkg:generic/cri-o`, `pkg:generic/cri-dockerd` | no rules yet |

`registry/kubernetes.json` holds upstream minor-release rules sourced to the [Kubernetes release history](https://kubernetes.io/releases/) page. They are the reviewed adoption of the `kubernetes-2` lifecycle importer's drafts: each of the five newest ended minors has an `end-of-life` rule at high severity, a minor whose announced end of life has not passed is `scheduled-end-of-life` at low severity (decision 0010), and a reviewed `1.28-and-older` rule covers the lines the importer no longer drafts. A weekly importer run keeps these fresh; a managed cluster should still be judged by its provider's schedule, which ends earlier than upstream's.

An `osImage` maps to the distribution's PURL when it names one the registry knows: `Ubuntu 22.04.5 LTS` to `pkg:generic/ubuntu` at `22.04.5`, `SUSE Linux Enterprise Server 15 SP6` to `pkg:generic/sles` at `15.6`, `Amazon Linux 2` to `pkg:generic/amzn` at `2`. These are the same PURLs and rules the os-release importer checks, so a node image and a host's `/etc/os-release` are judged by one set of dates. A distribution without rules — Bottlerocket, Container-Optimized OS, Flatcar, Rocky Linux, AlmaLinux — is still reported, at its own PURL, as `no-data`: not safe, just unruled. An image that names none of the known distributions produces no item.

`containerRuntimeVersion` maps to the runtime's PURL: `containerd://1.6.32` to `pkg:generic/containerd` at `1.6.32`. No runtime rule set exists yet, so these report `no-data`. A version that is not a plain release number (`containerd://1.6.x`) is reported without a version.

### What is not judged

- Node capacity, conditions, taints, labels, and addresses: never read or reported.
- A node whose `metadata.name` is an IP address is skipped entirely, because `resource` names a resource, never an address.
- The images running on the nodes and the objects' API versions: the workloads importer covers those.
- Whether the control plane and the kubelets are within the version-skew policy: skew compatibility is a different question from end of life.
- Anything the export does not state. No command is run, no API is called, and no other file is read.

The fixtures under `tests/fixtures/inventory/k8s-cluster/` reproduce the documented output shape of `kubectl version -o json` and `kubectl get nodes -o json` (kubectl 1.31), with every identifier replaced by a placeholder. They were assembled from the command's output shape, not captured from a live cluster.

## Host operating systems

The `os-release` importer reads an `/etc/os-release` file from one host, or a bundle collected from several hosts, and reports the distribution release against its lifecycle rules.

### Export

One host:

```bash
ssh web-1 'cat /etc/os-release' > web-1.os-release
evergreen inventory web-1.os-release
```

Several hosts, in one file. Each block starts with `### host: <name>`; that name becomes the result's `resource`:

```bash
while read -r host; do
  printf '### host: %s\n' "$host"
  ssh "$host" 'cat /etc/os-release'
done < hosts.txt > os-release.bundle
evergreen inventory os-release.bundle
```

Evergreen runs neither loop; you run it, and Evergreen reads the result.

### Fields read

| Field | Use |
| --- | --- |
| `ID` | Names the distribution, and so the `pkg:generic/<distro>` rule set. |
| `VERSION_ID` | The release line the rules judge. The result's `pointer` is the `line:<n>` of this line in the file. |
| `ID_LIKE` | Read as the declared family. It is never used to apply a parent distribution's dates, because a derivative keeps its own release schedule. |

A block without both `ID` and a numeric `VERSION_ID` is skipped: a codename or a rolling tag such as `testing` does not name a release line the rules can judge. A single file with no host header uses its file name as the resource. Quoted values, such as `VERSION_ID="20.04"` and `ID='ubuntu'`, are read the same as unquoted ones.

### Rules matched

| Distribution (`ID`) | PURL | Release lines reported | Rule |
| --- | --- | --- | --- |
| `ubuntu` | `pkg:generic/ubuntu` | before 22.04 | `container.host-ubuntu.eol-22.04-and-older` |
| `debian` | `pkg:generic/debian` | before 12 | `container.host-debian.eol-11-and-older` |
| `rhel` | `pkg:generic/rhel` | 7 and older | `container.host-rhel.eol-7-and-older` |
| `centos` | `pkg:generic/centos` | 8 and older | `container.host-centos.eol-8-and-older` |
| `amzn` | `pkg:generic/amzn` | 2 and the 2018.03 AMI | `container.host-amazon-linux.eol-2-and-older` |
| `alpine` | `pkg:generic/alpine` | before 3.21 | `container.host-alpine.eol-3.20-and-older` |
| `sles` | `pkg:generic/sles` | 15 SP6 and older | `container.host-sles.eol-15-sp6-and-older` |

Every rule cites the distribution's own lifecycle page, not an aggregator. The rules live in `registry/container.json` next to the image rules, but use `pkg:generic/<distro>` PURLs and distribution sources: an image rule describes what a Docker tag ships, which is not the same question as what a host runs.

### What is not judged

- A file without `VERSION_ID` is skipped: a codename alone does not identify the release line for every distribution.
- A derivative reported under its own `ID` is checked only if that `ID` has a rule. `ID_LIKE` does not borrow the parent's dates. It is reported as `no-data`, not as safe.
- Paid add-on support is not treated as standard support. RHEL 7 Extended Life Cycle Support and SUSE Long Term Service Pack Support extend security fixes for a fee; the rules report that general support ended and name the add-on in the summary.
- A host with no readable `/etc/os-release` is not reported. Evergreen does not guess a distribution from other files.

### Fixtures

The fixtures under `tests/fixtures/inventory/os-release/` are the output of `cat /etc/os-release` on each distribution, with every identifier replaced by a placeholder. There is no CLI version to record: `cat` is part of the coreutils of each distribution.

## Docker containers and images

Produce the exports with the Docker CLI. Both forms are supported:

```bash
# running and stopped containers, including labels and state
docker inspect $(docker ps -aq) > docker-inspect.json

# a Compose project: a JSON array, or one JSON object per line
docker compose ps --format json > docker-compose-ps.json
```

The fixtures under [`tests/fixtures/inventory/docker/`](../tests/fixtures/inventory/docker/) follow the output of Docker CLI 29.6.2 (`docker inspect`) and Docker Compose v2 (`docker compose ps --format json`), with ids, names, and image tags replaced. The example [`examples/inventory/docker-inspect.json`](../examples/inventory/docker-inspect.json) is the same shape.

### What is read

| Format | Fields | Pointer |
| --- | --- | --- |
| `docker inspect` | `Name`, `Config.Image` | `/i/Name`, `/i/Config/Image` |
| `docker inspect` | `Config.Labels["org.opencontainers.image.base.name"]` | `/i/Config/Labels/org.opencontainers.image.base.name` |
| `docker inspect` | `Config.Labels["org.opencontainers.image.version"]` | `/i/Config/Labels/org.opencontainers.image.version` |
| `docker compose ps` | `Service`, `Image` | `/i/Service`, `/i/Image` |

`i` is the entry's index in the JSON array, or the zero-based line for line-delimited Compose output. Nothing else is read: `Env`, `Mounts`, `NetworkSettings`, `Ports`, and `Labels` beyond the two OCI labels above never appear in the report.

`resource` is the container name without the leading `/`, or the Compose service name. The image reference is parsed with the same parser the container detector uses ([`src/detectors/container/parse-image.ts`](../src/detectors/container/parse-image.ts)); interpolated values (`${IMAGE}`) and invalid references are skipped, never guessed.

### Rules matched

Images map to Docker PURLs, `pkg:docker/<repository>`, and are checked against [`registry/container.json`](../registry/container.json). For example, `node:18-alpine` becomes `pkg:docker/library/node` at version `18-alpine`, and `redis:6.0` becomes `pkg:docker/library/redis` at `6.0`. A tag that names a release line is the version; a floating tag such as `latest` or a digest-only reference has no version, so a range rule reports `version-dependent` instead of guessing.

Images from a registry other than Docker Hub keep the registry as the PURL namespace, for example `pkg:docker/ghcr.io/acme/app`. No Docker Hub rule matches those PURLs, so they are reported as `no-data`.

The two OCI labels add items when present: `org.opencontainers.image.base.name` is the base image, and `org.opencontainers.image.version` is the image's own version. Both are checked against the same rules, with the container name as their resource.

### Image ids

When `Config.Image` is a bare image id (`sha256:…`), Evergreen does not resolve it to an image. The container is reported with the PURL `pkg:docker/image-id` and the id as its version, which yields `no-data`: there is no lifecycle rule for an unresolved id. Run `docker inspect --format '{{.Config.Image}}' <container>` with a name instead when you need the image.

### What is not judged

- The operating system and runtimes *inside* an image: export or unpack the root filesystem and run `evergreen scan` on it.
- Images on registries other than Docker Hub, and Microsoft .NET images on `mcr.microsoft.com`: no rule is applied.
- Environment variables, mounts, published ports, and network settings: never read or reported.
- Whether a container is running: stopped containers are reported the same way.

## Report shape

The JSON report is `evergreen.inventory.v1`, validated by [`schemas/inventory.v1.schema.json`](../schemas/inventory.v1.schema.json). `results` holds one entry per item and check; `unrecognized` lists the files no importer recognized. Items are sorted by file and pointer, so the same exports produce the same report.

A Package URL with no rule is reported as `no-data`; when a PURL has rules but none covers the version, the item is `not-affected`. Neither status is a statement that the version is safe. A rule for an announced date that has not happened yet is a `scheduled-end-of-life` finding at low severity, so it does not fail a `high` gate.

## Importers

| Importer | Reads | Export command |
| --- | --- | --- |
| `aws-rds` | AWS RDS instances, Aurora clusters, and ElastiCache cache clusters | `aws rds describe-db-instances`, `aws rds describe-db-clusters`, `aws elasticache describe-cache-clusters` |
| `k8s-cluster` | Kubernetes control-plane and kubelet versions, node OS images, and container runtimes | `kubectl version -o json`, `kubectl get nodes -o json` |
| `terraform-state` | Terraform state from `terraform show -json` or a raw `terraform.tfstate` v4 file | `terraform show -json` |

## AWS RDS, Aurora, and ElastiCache

### Produce the export

Use the AWS CLI with JSON output and pass the file to `evergreen inventory`:

```bash
aws rds describe-db-instances --output json > rds-instances.json
aws rds describe-db-clusters --output json > rds-clusters.json
aws elasticache describe-cache-clusters --output json > cache-clusters.json

evergreen inventory rds-instances.json rds-clusters.json cache-clusters.json
```

The fixtures under `tests/fixtures/inventory/aws-rds/` are sanitized samples of these three documents: every account id, ARN, endpoint, and subnet id is a placeholder, and only the fields below are kept. They were assembled from the published output shape of `aws-cli` during review rather than captured from a live account.

### Fields read

| Document | Array | Engine field | Version field | Resource field |
| --- | --- | --- | --- | --- |
| `describe-db-instances` | `DBInstances` | `Engine` | `EngineVersion` | `DBInstanceIdentifier` |
| `describe-db-clusters` | `DBClusters` | `Engine` | `EngineVersion` | `DBClusterIdentifier` |
| `describe-cache-clusters` | `CacheClusters` | `Engine` | `EngineVersion` | `CacheClusterId` |

Everything else in the document is ignored: ARNs, endpoints, reader endpoints, hosted zone ids, subnet groups, VPC ids, security groups, tags, and parameter groups. An entry without a string `Engine`, `EngineVersion`, and resource field is skipped, never guessed.

### Engines and PURLs

| AWS engine | Provider PURL | Upstream PURL |
| --- | --- | --- |
| `postgres` | `pkg:generic/aws-rds/postgres` | `pkg:generic/postgresql` |
| `mysql` | `pkg:generic/aws-rds/mysql` | `pkg:generic/mysql` |
| `aurora-postgresql` | `pkg:generic/aws-aurora/postgresql` | `pkg:generic/postgresql` |
| `aurora-mysql`, `aurora` | `pkg:generic/aws-aurora/mysql` | none (see below) |
| `redis` | `pkg:generic/aws-elasticache/redis` | `pkg:generic/redis` |

Each recognized object produces two items when the version is also an upstream version, so the report shows both the provider's schedule and the upstream engine's schedule. AWS standard support and extended support dates differ from upstream end of life, and the rules are kept separate for that reason.

Aurora MySQL is the exception: its `EngineVersion` embeds the Aurora version, as in `8.0.mysql_aurora.3.10.0`, which is not an upstream MySQL release. Only the Aurora item is emitted rather than comparing that string to upstream MySQL rules.

Unknown engines are skipped: `mariadb`, `sqlserver-*`, `oracle-*`, `db2-*`, `memcached`, and `valkey` have no reviewed rule in this importer yet, so they produce no item and no claim.

### Rules matched

The rules live in [`registry/database.json`](../registry/database.json) under the provider PURLs, with the AWS release calendar as their source. "End of standard support" is recorded with the registry's `end-of-support` event; an announced date that is still in the future is recorded as `scheduled-end-of-life` at low severity until it passes. The summary of each rule says whether RDS Extended Support or ElastiCache Extended Support may keep the version running for a fee.

| Service | Versions with a rule (as of 2026-10-30) |
| --- | --- |
| RDS for PostgreSQL | 9.6, 10, 11, 12, 13 (ended); 14 (scheduled 2027-02-28) |
| RDS for MySQL | 5.7, 8.0 (ended) |
| Aurora PostgreSQL | 11, 12, 13 (ended); 14 (scheduled 2027-02-28) |
| Aurora MySQL | 1 (5.6), 2 (5.7) (ended) |
| ElastiCache Redis OSS | 4, 5 (ended 2026-01-31); 6 (scheduled 2027-01-31) |

A version outside these ranges is not reported as supported. When the provider PURL has rules for other versions, the item is `not-affected`: the check message says that rules exist and none covers this version. When the PURL has no rules at all, it is `no-data`. Neither status is a statement that the version is safe. This includes RDS for PostgreSQL 15 and later, RDS for MySQL 8.4 and later, Aurora PostgreSQL 15 and later, Aurora MySQL 3 and 8.4, and Redis OSS 7.x. Their announced end-of-standard-support dates are more than twelve months past the review date, so no rule is recorded yet under decision [0010](decisions/0010-scheduled-end-of-life.md); a later review adds them when the dates come within the window.

### What is not judged

The importer does not judge instance classes, storage, IOPS, parameter groups, patch levels within a supported minor version, certificate authorities, Multi-AZ or read-replica topology, backup retention, encryption, or licensing. It does not judge MariaDB, SQL Server, Oracle, Db2, Memcached, or Valkey. It does not verify that an export is complete or current. It does not read an AWS account, role, or region, and it cannot see an object that the export omits.

## Export files

Each section below documents one importer: the exact command that produces the export, the fields Evergreen reads, the lifecycle rules it matches, and what it does not judge. Fixtures live under `tests/fixtures/inventory/`, with every identifier replaced by a placeholder; the command and CLI version that produced them are recorded in the section.

## AWS Lambda

```bash
aws lambda list-functions --output json > lambda.json
evergreen inventory lambda.json
```

`list-functions` paginates. With pagination on, the CLI prints one JSON page after another; `evergreen` accepts the single page a one-page account prints as well as the array of pages a scripted caller collects. The fixtures under `tests/fixtures/inventory/aws-lambda/` reproduce the documented output of `aws lambda list-functions --output json` from AWS CLI v2, with every identifier replaced by a placeholder; they were not captured against a live account, so no CLI version is recorded.

**Fields read**

| Field | Use |
| --- | --- |
| `Functions[].FunctionName` | `resource` and nothing more. |
| `Functions[].Runtime` | `version`, and the runtime identifier in `pkg:generic/aws-lambda-runtime/<Runtime>`. |
| `Functions[].PackageType` | `Image` means the function runs a container image, which has no managed runtime, so it is skipped. |

Nothing else is copied: not `FunctionArn`, `Role`, environment variables, tags, account id, code, or architecture.

**Rules matched**

`registry/serverless.json`, the `pkg:generic/aws-lambda-runtime/<identifier>` PURLs. Every runtime the [AWS Lambda runtimes page](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) gives a deprecation date for has a rule: a runtime the page lists under Deprecated runtimes is `end-of-life` at `high`, and a runtime the page lists as supported with a projected deprecation date is `scheduled-end-of-life` at `low` with that date as its deadline. The same rules back the Serverless detector, so one lifecycle fact reaches a declaration and a live function alike.

**Not judged**

- Container-image functions (`PackageType: "Image"`): their runtime lives in the image, not in the function's configuration. Rebuild the image from a newer base image instead.
- Runtimes AWS has not dated — today `nodejs26.x` and `python3.15`, which the page lists as public preview and not scheduled — are reported as `no-data`, which is not a statement that they are safe.
- Function versions, aliases, `$LATEST`, code, layers, architecture, and memory: none of them changes the runtime lifecycle answer.
- Functions that a different export would show: this importer reads only the file you pass, and only the functions in it.

## AWS EKS clusters and node groups

```bash
aws eks describe-cluster --name prod-payments > cluster.json
aws eks describe-nodegroup --cluster-name prod-payments --nodegroup-name workers > nodegroup.json
evergreen inventory cluster.json nodegroup.json
```

Each command prints one document: `describe-cluster` prints `{"cluster": …}` and `describe-nodegroup` prints `{"nodegroup": …}`. A script that collects several outputs into one JSON array is read as well, so `jq -s '.[] | {cluster: .}'` over a list of cluster exports works; an array is read only when every element is one of the two document shapes.

**Fields read**

| Export | Fields | PURL | Version |
| --- | --- | --- | --- |
| `aws eks describe-cluster` | `cluster.name`, `cluster.version` | `pkg:generic/amazon-eks` | `version` |
| `aws eks describe-nodegroup` | `nodegroup.clusterName`, `nodegroup.nodegroupName`, `nodegroup.version` | `pkg:generic/amazon-eks` | `version` |
| `aws eks describe-nodegroup` | `nodegroup.amiType` | `pkg:generic/amzn` | the Amazon Linux release the AMI type is built on |

`resource` is the cluster name for a cluster and `<clusterName>/<nodegroupName>` for a node group; a node group whose export carries no `clusterName` is named by its own name alone. A pointer marks the exact field the version came from — `/cluster/version`, `/nodegroup/amiType` — with `/<entry>` in front for an array, so `/1/nodegroup/version` is the `version` of the second entry.

A version is read only in the shape EKS itself writes: `1.31` or `1.31.4`. A `v` prefix or an `-eks-…` build suffix is the kubelet string a node reports, not the cluster's release line, so such a value is skipped rather than guessed; run `kubectl get nodes -o json` and the Kubernetes cluster importer for those. `aws eks list-clusters` and `aws eks list-nodegroups` print names only, and `aws eks describe-cluster-versions` prints the versions EKS offers rather than the one deployed: none of them is read.

**Amazon Linux AMI types**

`amiType` names the Amazon EKS optimized AMI the nodes run, and each type is built on a known Amazon Linux release:

| `amiType` | Item |
| --- | --- |
| `AL2_x86_64`, `AL2_x86_64_GPU`, `AL2_ARM_64` | `pkg:generic/amzn` at `2` |
| `AL2023_x86_64_STANDARD`, `AL2023_ARM_64_STANDARD`, `AL2023_x86_64_NEURON`, `AL2023_x86_64_NVIDIA`, `AL2023_ARM_64_NVIDIA` | `pkg:generic/amzn` at `2023` |

The item is judged by the same host-OS rules a server's `/etc/os-release` is judged by, so an AL2 node group reports the Amazon Linux 2 end of support and an AL2023 node group reports `not-affected` — which says nothing about the packages inside the AMI. `BOTTLEROCKET_*`, `WINDOWS_*`, and `CUSTOM` produce no Amazon Linux item: no reviewed rule judges them, so the node group's operating system is skipped rather than guessed. `releaseVersion` (`AL2023_x86_64_STANDARD_20260918`) is an AMI build string and `platformVersion` (`eks.3227`) is the EKS platform, neither of which has a lifecycle of its own, so neither is read.

**Rules matched**

- `registry/kubernetes.json`: the `pkg:generic/amazon-eks` minor-version rules, sourced to the [Amazon EKS version lifecycle page](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html). A version past end of standard support but still inside its 12 months of extended support is `end-of-support` at `medium` with that end date as its deadline; `1.30` and earlier, which the calendar no longer lists, are `end-of-life` at `high`; an announced end of standard support that has not passed yet is `scheduled-end-of-life` at `low` ([decision 0010](decisions/0010-scheduled-end-of-life.md)), which is why `1.34`, `1.35`, and `1.36` carry rules and `1.37` does not yet — its date, 2027-12-01, is more than twelve months out.
- `registry/container.json`: the `pkg:generic/amzn` rules for a node group's AMI type.

`registry/terraform.json` carries the same EKS facts as its own rules for the Terraform detector, which reads `cluster_version` in `*.tf`; the Terraform state importer reads `registry/kubernetes.json`, so a state file's `aws_eks_cluster` and a live `describe-cluster` export are judged by the same rules.

**What is not judged**

- Self-managed nodes, Fargate pods, and any node outside a managed node group: `aws eks describe-nodegroup` only describes managed node groups. Use `kubectl get nodes -o json` for what is actually running.
- `cluster.addons[]` versions, `accessConfig`, `encryptionConfig`, `outpostConfig`, and upgrade policies.
- `endpoint`, `certificateAuthority.data`, `arn`, `roleArn`, `resourcesVpcConfig`, `subnets`, `securityGroupIds`, `remoteAccess.ec2SshKey`, tags, and labels: never read, never emitted.
- An EKS release no rule covers yet — today `1.37` — which reports `no-data`. `no-data` is never a statement that the version is supported.

**Fixtures**

`tests/fixtures/inventory/aws-eks/` holds one sanitized sample per document type, plus `rejects/` for the shapes listed above, with every account id, ARN, endpoint host, certificate, subnet, VPC and security group id, SSH key name, and tag value replaced by a placeholder. `examples/inventory/aws-eks.json` is a runnable sample. The shapes follow the documented output of AWS CLI v2 rather than a capture from a live account, so no CLI version is recorded.

## Google Cloud

```bash
gcloud functions list --format=json > functions.json
gcloud app versions list --format=json > app-engine-versions.json
gcloud container clusters list --format=json > gke-clusters.json
gcloud run services list --format=json > cloud-run-services.json
evergreen inventory functions.json app-engine-versions.json gke-clusters.json cloud-run-services.json
```

**Fields read**

| Export | Fields | PURL |
| --- | --- | --- |
| `gcloud functions list --format=json` | `name`, `runtime` (1st gen) or `buildConfig.runtime` (2nd gen) | `pkg:generic/google-cloud-functions-runtime/<runtime>` |
| `gcloud app versions list --format=json` | `name`, `runtime` | `pkg:generic/google-appengine-runtime/<runtime>` |
| `gcloud container clusters list --format=json` | `name`, `currentMasterVersion`, `currentNodeVersion` | `pkg:generic/google-gke` |
| `gcloud run services list --format=json` | `metadata.name`, `spec.template.spec.containers[].image` | `pkg:docker/library/<image>` |

`name` supplies the resource: the last path segment, never the project id or number. A Cloud Functions or App Engine runtime item reports the runtime as part of PURL, so the pointer marks the exact field the runtime was read from. A GKE cluster produces one item for the control-plane version and, when it differs, one for the node version; `releaseChannel` does not change the verdict, because the rules state both the end of standard support and the end of extended support.

Cloud Run has no managed language runtime. The importer reads only container images and only those that name a public Docker Hub base image (`node:20`, `python:3.12-slim`, or `library/node:20`): an image with a registry host or a namespace (`gcr.io/…`, `us-docker.pkg.dev/…`, `bitnami/node`) is skipped, as is an image with no tag, a digest-only reference, or a tag that does not start with a digit. A short image name maps to `pkg:docker/library/<name>` with the tag as the version.

**Rules matched**

- `registry/serverless.json`: Google Cloud Functions and App Engine runtime rules, sourced to Google's runtime support schedules.
- `registry/kubernetes.json`: GKE minor-version rules, sourced to the GKE release schedule.
- `registry/container.json`: base-image rules for Cloud Run images.

**What is not judged**

- Runtime *generations* and stack images (`google-22`, `google-24-full`); only the runtime ID is checked.
- Operating-system packages inside a function or container image.
- Image digests, private images, and image names that are not public base images.
- Anything not written literally in the export: a reference, a variable, or a value the export does not include is not resolved.

**Fixtures**

`tests/fixtures/inventory/gcp/` holds one sanitized sample per document type, and `examples/inventory/` holds two runnable samples. Each follows the JSON the commands above print, reduced to the fields this importer reads, with every project id, number, service account, URL, IP address, and environment value replaced by a placeholder. No `gcloud` CLI version is recorded because the contributor who added this importer had no Google Cloud project to capture exports from; the shapes follow the documented JSON output of the commands above rather than a recorded response.

## Azure

```bash
az webapp list -o json > webapps.json
az functionapp list -o json > functionapps.json
az aks list -o json > aks-clusters.json
evergreen inventory webapps.json functionapps.json aks-clusters.json
```

**Fields read**

| Export | Fields | PURL |
| --- | --- | --- |
| `az webapp list -o json` | `name`, `kind`, `siteConfig.linuxFxVersion` or `siteConfig.windowsFxVersion` | `pkg:generic/azure-app-service/<stack>` |
| `az functionapp list -o json` | the same, plus `siteConfig.FUNCTIONS_EXTENSION_VERSION` | `pkg:generic/azure-app-service/<stack>` and `pkg:generic/azure-functions` |
| `az aks list -o json` | `name`, `kubernetesVersion`, `agentPoolProfiles[].orchestratorVersion` | `pkg:generic/azure-aks` |

`name` supplies the resource: the app or cluster name, never the subscription id, the resource group id, a host name, or an ARM `id` path.

**Stack references**

`linuxFxVersion` and `windowsFxVersion` name the managed stack and its version in one string. The prefix selects the stack and the part after the first `|` is read as the version, stopping at the first `-`:

| Reference | Item |
| --- | --- |
| `NODE\|18-lts` | `pkg:generic/azure-app-service/node` at `18` |
| `PYTHON\|3.8` | `pkg:generic/azure-app-service/python` at `3.8` |
| `DOTNETCORE\|6.0` | `pkg:generic/azure-app-service/dotnet` at `6.0` |
| `DOTNET-ISOLATED\|7.0` | `pkg:generic/azure-app-service/dotnet-isolated` at `7.0` |
| `JAVA\|11-java11` | `pkg:generic/azure-app-service/java` at `11` |
| `PHP\|8.0` | `pkg:generic/azure-app-service/php` at `8.0` |

A reference with a third part (`PYTHON\|3.11\|3.0`) gives the same version. `DOCKER\|<image>` is a custom container with no managed stack, an empty value, a prefix this importer has no rules for, a reference with more than three parts (`JAVA\|8\|TOMCAT\|9.0`, where the app-server release is what a rule would need), and an app with no `siteConfig` are all skipped rather than guessed.

`az webapp list` and `az functionapp list` print the `SiteResource`, whose `siteConfig` the App Service API omits from a normal read because it can hold secrets. When the export has no `siteConfig`, read each app's configuration and keep its name and kind:

```bash
az webapp list -o tsv --query '[].{group:resourceGroup,name:name,kind:kind}' \
  | while read -r group name kind; do
      az webapp config show -g "$group" -n "$name" -o json \
        | jq --arg name "$name" --arg kind "$kind" '{name: $name, kind: $kind, siteConfig: .}'
    done \
  | jq -s '.' > webapps.json
evergreen inventory webapps.json
```

`az aks list` returns the cluster versions directly, so no follow-up call is needed.

**Functions runtime**

The Functions runtime version is an app setting in Azure, and app settings are never read: they carry connection strings and keys. An item is therefore produced only for an export that writes the value straight into `siteConfig`, never for one that carries it as a `siteConfig.appSettings` entry, and never for a setting named in an app whose `kind` does not include `functionapp`. Both spellings of the value are read: `~4` becomes version `4` and a pinned build such as `2.0.12345` keeps its build.

**AKS versions**

A cluster produces one item for its control plane (`kubernetesVersion`) and one for each agent pool version that differs from a version already reported for that cluster (`agentPoolProfiles[].orchestratorVersion`), so a pool that matches its control plane is not counted twice.

**Rules matched**

- `registry/serverless.json`: the `pkg:generic/azure-app-service/<stack>` and `pkg:generic/azure-functions` rules, sourced to Azure's [language runtime support policy](https://learn.microsoft.com/en-us/azure/app-service/language-support-policy) and [Functions runtime version page](https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions), each citing the community schedule Azure follows for that runtime.
- `registry/kubernetes.json`: the `pkg:generic/azure-aks` minor-version rules, sourced to the [AKS supported Kubernetes versions page](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions). A version past its 12-month support window is `end-of-support` at `medium`; one past opt-in long-term support is `end-of-life` at `high`; an announced window end that has not passed yet is `scheduled-end-of-life` at `low`.

**What is not judged**

- `agentPoolProfiles[].osSku` and `windowsVersion`, and any node operating system or package inside a node image: the AKS rules judge the Kubernetes version only. Scan a node root filesystem export for its packages.
- `siteConfig.appSettings` and every other app setting, including a `FUNCTIONS_WORKER_RUNTIME` or a `FUNCTIONS_EXTENSION_VERSION` that only lives there.
- Host names, IPs, URLs, `serverFarmId`, SKU, location, tags, `resourceGroup`, and ARM `id` paths.
- Custom-container apps, and a Java app server (Tomcat, JBoss) named in a stack reference: no rule is applied to it.
- A stack version with no rule yet — today for example `NODE|24` or `JAVA|11` — which reports `not-affected`. That is not a statement that the version is supported; it says no Azure rule covers it.

**Fixtures**

`tests/fixtures/inventory/azure/` holds one sanitized sample per document type, with every subscription id, resource group id, ARM path, host name, IP address, DNS prefix, SSH key, service principal, and app-setting value replaced by a placeholder. `examples/inventory/azure-webapps.json` and `examples/inventory/aks.json` are runnable samples. No Azure CLI version is recorded because the contributor who added this importer had no Azure subscription to capture exports from; the shapes follow the documented JSON output of the commands above rather than a recorded response.

## Terraform state

The `terraform-state` importer reads the values Terraform recorded for deployed resources. It accepts two shapes:

```bash
# the state JSON `terraform show -json` prints
terraform show -json > state.json

# or the raw state file itself
evergreen inventory state.json terraform.tfstate
```

The first shape is state JSON: `format_version` plus `values.root_module`. The second is the raw state file: `version: 4` plus `resources`. Plan JSON (`planned_values.root_module`) is not read, because it describes a proposed change rather than what is deployed. The importer does not read `*.tf` source files; the Terraform detector already does that.

**Fields read**

Every module under `values.root_module`, including `child_modules` at any depth, and every resource instance is walked. In raw state, every entry of `resources` and every instance of `instances` is walked. Data sources and deposed objects are skipped.

| Resource type | Attribute | PURL | Version |
| --- | --- | --- | --- |
| `aws_lambda_function` | `runtime` | `pkg:generic/aws-lambda-runtime/<runtime>` | the runtime ID |
| `aws_db_instance`, `aws_rds_cluster`, `aws_elasticache_cluster`, `aws_elasticache_replication_group` | `engine`, `engine_version` | the AWS engine table below | `engine_version` |
| `aws_eks_cluster` | `version` | `pkg:generic/amazon-eks` | `version` |
| `google_container_cluster` | `master_version` | `pkg:generic/google-gke` | `master_version` |
| `google_cloudfunctions_function` | `runtime` | `pkg:generic/google-cloud-functions-runtime/<runtime>` | none: the runtime is part of the PURL |
| `google_cloudfunctions2_function` | `build_config[0].runtime` | `pkg:generic/google-cloud-functions-runtime/<runtime>` | none: the runtime is part of the PURL |
| `azurerm_kubernetes_cluster` | `kubernetes_version` | `pkg:generic/azure-aks` | `kubernetes_version` |
| `azurerm_linux_function_app` | `site_config[0].application_stack` | `pkg:generic/azure-app-service/<stack>` | the stack version |

Nothing else in the state is copied. ARNs, resource ids, endpoints, provider configurations, outputs, tags, environment variables, and Terraform or provider versions are never read or reported. A value that is missing, empty, not a string, or not a release-shaped value is skipped, never guessed.

**Resource and pointer**

`resource` is `<type>.<name>`, with `[index]` for `count` and `["key"]` for `for_each`, such as `aws_lambda_function.worker[0]` or `aws_lambda_function.api["green"]`. A nested resource keeps the same form; the module path is in the JSON Pointer, not in `resource`. Every pointer resolves to the exact string the item's version came from: `/values/root_module/resources/<i>/values/<attribute>` for state JSON, or `/resources/<i>/instances/<j>/attributes/<attribute>` for raw state, with `child_modules` segments in between.

**Engines and PURLs**

The engine mapping is the one the AWS RDS importer uses, so a deployed engine and a described engine are checked against the same rules:

| AWS engine | Provider PURL | Upstream PURL |
| --- | --- | --- |
| `postgres` | `pkg:generic/aws-rds/postgres` | `pkg:generic/postgresql` |
| `mysql` | `pkg:generic/aws-rds/mysql` | `pkg:generic/mysql` |
| `aurora-postgresql` | `pkg:generic/aws-aurora/postgresql` | `pkg:generic/postgresql` |
| `aurora-mysql`, `aurora` | `pkg:generic/aws-aurora/mysql` | none |
| `redis` | `pkg:generic/aws-elasticache/redis` | `pkg:generic/redis` |

Unknown engines, including `mariadb`, `sqlserver-*`, `oracle-*`, `db2-*`, `memcached`, and `valkey`, produce no item and no claim.

The Linux Function App stack reads the managed version fields of `application_stack` and maps each one to its own item:

| Field | PURL |
| --- | --- |
| `dotnet_version` | `pkg:generic/azure-app-service/dotnet` |
| `dotnet_isolated_version` | `pkg:generic/azure-app-service/dotnet-isolated` |
| `java_version` | `pkg:generic/azure-app-service/java` |
| `node_version` | `pkg:generic/azure-app-service/node` |
| `python_version` | `pkg:generic/azure-app-service/python` |
| `powershell_core_version` | `pkg:generic/azure-app-service/powershell` |

A leading `~` in a Node.js version is Azure's release-line notation, so `~18` is reported at version `18`. `use_custom_runtime` and a `docker` image mean the runtime is not a managed stack, so they produce no item.

**Rules matched**

- `registry/database.json`: RDS, Aurora, and ElastiCache engine rules, the same rules the AWS RDS importer uses.
- `registry/kubernetes.json`: GKE, AKS, and EKS minor-version rules.
- `registry/serverless.json`: AWS Lambda, Google Cloud Functions, and Azure App Service stack and Functions runtime rules.

`pkg:generic/amazon-eks` has rules in both `registry/kubernetes.json`, which this importer reads, and `registry/terraform.json`, which the Terraform source detector reads, so a cluster recorded in state and a `cluster_version` written in `*.tf` are judged by the same calendar. An EKS version no `registry/kubernetes.json` rule covers reports `no-data`. `no-data` is never a statement that the version is safe.

**What is not judged**

- Terraform plan JSON, `*.tf` source, module outputs, and provider configurations: this importer reads state values only.
- Deposed instances: only current instances are reported.
- Resource types and attributes beyond the table above, including EKS node groups, RDS proxy endpoints, and functions deployed outside the listed resource types.
- Whether the state is current, whether it matches the configuration, or whether a remote backend is reachable. Evergreen reads only the file you pass and never runs Terraform.

**Fixtures**

`tests/fixtures/inventory/terraform-state/` holds one sample of each format, including nested modules and `count` and `for_each` instances, with every account id, ARN, subscription id, project number, hostname, and environment value replaced by a placeholder. `examples/inventory/terraform-state.json` is a runnable sample in the `terraform show -json` shape. They were assembled from the documented state shape of Terraform 1.9 rather than captured from a live state; no Terraform CLI version is recorded.
