# Container base images

The `container` detector reports base images whose release line has reached a vendor-published end of life. It is **experimental**: it is scored on the [public corpus](../VALIDATION.md) but not yet held to the precision floor that stable detectors are. The reasoning is in [Decision 0007](../decisions/0007-container-detector.md).

## What it reads

| File | Declaration |
| --- | --- |
| `Dockerfile`, `Dockerfile.*`, `*.Dockerfile`, `Containerfile`, `Containerfile.*` | `FROM <image>[:<tag>][@<digest>]`, with `--platform` and `AS <stage>` accepted and line continuations joined |
| `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`, `docker-compose.*.yml` | `services.<name>.image` |

It walks the repository up to eight directories deep (at most 2,000 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`.

## What it matches

Docker Hub official images only: `node`, `python`, `postgres`, `mysql`, and `ruby` (`node`, `library/node`, and `docker.io/library/node` are the same image). Images from other registries or organizations (`ghcr.io/acme/node`, `myorg/node`) are never matched.

A tag is read as a release line when it starts with a version and carries only a known variant suffix (`alpine`, `slim`, `bookworm`, `bullseye`, `jammy`, and similar). `node:18`, `node:18.20.4-alpine`, and `postgres:11.5-bullseye` are classified. A finding is reported only when **every** version the tag can stand for is inside the rule's range.

## What it intentionally does not judge

These are reported as [unclassified references](../DETECTORS.md#unclassified-references) (with file and line), never as findings and never guessed:

- a tag that is a build argument or variable, such as `node:${NODE_VERSION}` (Evergreen does not expand it; `$BASE_IMAGE` is skipped entirely because the image is unknown);
- `latest`, no tag, or a digest with no tag;
- a floating tag that spans supported and unsupported versions: `mysql:8` can mean 8.0 or 8.4, so it is not flagged, while `mysql:8.0` is;
- a tag with a suffix Evergreen does not recognize, such as `node:20-custom-build`.

Nothing is reported for `scratch`, a `FROM` that names an earlier stage, comments, `RUN` strings, Compose keys other than `services.*.image` (`container_name`, `labels`, extension fields), YAML aliases, or invalid files.

## Known limits and false-positive boundaries

- An image kept on an old release line **on purpose** (for example a compatibility test against `mysql:5`) is still reported. The rule states a vendor fact; whether the old version is intended is for the repository to decide, for example with a [baseline](../../README.md).
- Only the image's own release line is judged. The operating system inside the image (Debian, Alpine) is not.
- Kubernetes manifests, Helm charts, Terraform, CI files, and `docker buildx bake` files are not read.
- `postgres` and `mysql` upgrades need a data migration; the rule's migration guidance says so, but Evergreen cannot check the data.

## Data

The rules are in `registry/container.json` and ship in the [data bundle](../DATA.md). The Node.js and Python rules are drafted by the `container-official-images` [importer](../IMPORTERS.md) from the vendors' own schedules; the PostgreSQL, MySQL, and Ruby rules are hand-written from each vendor's lifecycle page. The Docker Official Images repository is never used to decide support status. Each rule links its vendor source and carries migration steps and verification commands (`docker build .`, `docker run --rm IMAGE ... --version`).

## Validation

Five public repositories at pinned commits are in the corpus (four with end-of-life images, one with none). Their expected findings were reviewed by hand against the files at that commit, and where the maintainers later moved off the image the note links their commit.
