# 0007 — Detect end-of-life container base images from Dockerfiles and Compose files

Status: accepted

Evergreen will add a `container` detector that reads base-image references from repository files and reports the ones whose image release line has reached a vendor-published end of life. It follows the existing [detector SDK](../DETECTORS.md) and the [v2 registry](0004-registry-v2.md); it adds no new engine behavior.

## What the detector reads

| Declaration | Files | Deterministic? |
|---|---|---|
| `FROM <image>[:<tag>][@<digest>]` | `Dockerfile`, `Dockerfile.*`, `*.Dockerfile`, `Containerfile`, `Containerfile.*` | Yes, when the reference is a literal |
| `FROM --platform=<p> <image>…` | same | Yes; the flag is skipped, the image is read |
| `FROM <image> AS <stage>` | same | Yes; the stage name is ignored |
| `FROM <stage>` where `<stage>` was defined earlier in the same file | same | Not an image; skipped (the earlier `FROM` is the declaration) |
| `image: <image>[:<tag>][@<digest>]` under `services` | `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`, `docker-compose.*.yml` | Yes, when the value is a literal |

Image references are parsed into registry, repository, tag, and digest. The version is taken from the **tag** only. Official images that carry a vendor lifecycle (`node`, `python`, `postgres`, `mysql`, `redis`, and similar) are matched by repository name on Docker Hub (`node`, `library/node`, `docker.io/library/node`); images on other registries are matched only when a rule names that exact registry and repository.

## What is dynamic, and what happens to it

A reference is **dynamic** when its image or tag cannot be known without running something:

- build arguments and variables: `FROM node:${NODE_VERSION}`, `FROM $BASE`, Compose `${IMAGE:-node:18}`;
- a stage reference that resolves to another stage;
- a tag with no version part: `latest`, `lts`, `stable`, `alpine`, `slim`, or no tag at all.

Dynamic references produce **no finding** and no guess. Where the engine already reports unclassified references (`ScanResult.unclassified`), a dynamic reference to a lifecycle-tracked repository is reported there with its file and line, so the reader can see it was seen and not judged. Evergreen does not substitute a build-arg default: the default is a repository value, but the value that is actually built is decided by the build command, which Evergreen does not see.

A **digest-only** reference (`node@sha256:…`) has no tag and is unclassified. A **tag plus digest** (`node:20-bookworm@sha256:…`) is classified by its tag; the digest is recorded as evidence and never used for lifecycle.

## How tags map to versions

A tag is classified only if its leading component is a version of the image's release line and the rest is a known variant suffix. `node:18`, `node:18.20`, `node:18.20.4`, `node:18-alpine`, and `node:18.20.4-bookworm-slim` all belong to release line `18`. `node:latest`, `node:alpine`, and `node:lts-alpine` belong to none and are dynamic. A tag that starts with a version but ends in something Evergreen does not recognize (`node:18-custom-build`) is treated as unclassified rather than assumed to be Node 18.

## Where lifecycle facts come from

Allowed sources, each recorded in the rule's `provenance`:

- the image vendor's own lifecycle page or API (for example `endoflife.date` is **not** an allowed primary source here; the vendor page it summarizes is: Node.js release schedule, Python developer guide, PostgreSQL versioning policy, MySQL lifecycle, Redis release cycle);
- the Docker Official Images repository, only to confirm that a tag exists for a release line, never to decide support status.

Rejected inputs, which are never used to produce a rule or a finding:

- **popularity or download counts**;
- **"a newer tag exists"** — a newer release does not retire an older one;
- **vulnerability scanner output** for the image, because it describes packages in the image, not the support status of the line;
- **OS-layer inference** (the Debian or Alpine release behind a tag) — the first version covers the image's own release line, not the operating system inside it;
- any date that does not come from a vendor page cited in the rule.

## Out of scope for the first version

- Reading images from Kubernetes manifests, Helm charts, Terraform, GitHub Actions `container:`/`services:`, or CI files.
- Resolving images over the network, including tag-to-digest lookups and registry queries.
- Variable and `ARG` expansion, `.env` interpolation, and Compose `extends`/`include`.
- Vulnerability findings and base-image freshness ("a newer patch exists").
- Operating-system layers (Debian, Ubuntu, Alpine) inside a base image.
- Images built by Buildpacks, Nix, Bazel, or `docker buildx bake` files.

## Examples for the fixture task

True positives (rule exists for the release line, tag is literal):

- `FROM node:16` and `FROM --platform=linux/amd64 node:16-alpine AS build`
- `FROM docker.io/library/python:3.8-slim`
- Compose `services.db.image: postgres:11`
- `Containerfile` with `FROM redis:5@sha256:…`

Must not produce findings:

- `# FROM node:16` (comment) and `RUN echo "FROM node:16"`
- `FROM node:${NODE_VERSION}`, `FROM $BASE`, Compose `image: ${APP_IMAGE}`
- `FROM node:latest`, `FROM node`, `FROM node@sha256:…`
- `FROM build AS runtime` where `build` is an earlier stage
- Compose keys that look like images but are not: `container_name: node:16`, `labels: { image: node:16 }`, `build.image`-style names outside `services.*.image`
- `FROM scratch`
- a supported release line (`FROM node:22`)

Malformed: a Dockerfile with a truncated `FROM` and an unclosed line continuation, and a Compose file that is not valid YAML. Both must produce no findings and no crash.

## Consequences

- The detector is quiet by default. A repository that builds `FROM node:${V}` gets no lifecycle verdict from Evergreen, which is the honest answer.
- Container rules use the existing PURL + VERS format. The exact PURL shape for images is settled in the registry task, not here.
- Adding the detector means adding the scaffolded files and two registrations (`src/detectors/index.ts` and `BUNDLED_ECOSYSTEMS` in `src/data-bundle.ts`), as described in [DETECTORS.md](../DETECTORS.md).
