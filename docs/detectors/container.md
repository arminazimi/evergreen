# Container base images

The `container` detector reports base images whose release line has reached a vendor-published end of life. It also reads a built image's filesystem, when one is scanned, and reports the operating system and runtimes that actually ship inside it. It is **experimental**: it is scored on the [public corpus](../VALIDATION.md) but not yet held to the precision floor that stable detectors are. The reasoning is in [Decision 0007](../decisions/0007-container-detector.md).

## What it reads

| File | Declaration |
| --- | --- |
| `Dockerfile`, `Dockerfile.*`, `*.Dockerfile`, `Containerfile`, `Containerfile.*` | `FROM <image>[:<tag>][@<digest>]`, with `--platform` and `AS <stage>` accepted and line continuations joined |
| `compose.yaml`, `compose.yml`, `compose.*.yaml`, `compose.*.yml`, `docker-compose.yaml`, `docker-compose.yml`, `docker-compose.*.yaml`, `docker-compose.*.yml` | `services.<name>.image` (services built from a local Dockerfile via `build:` are skipped) |
| `devcontainer.json`, `.devcontainer/devcontainer.json` | `image` (top-level string; JSONC comments are accepted) |

It walks the repository up to eight directories deep (at most 2,000 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`.

## Built images and root filesystems

The detector reads a container filesystem directly, without pulling an image, resolving a tag, extracting an archive, or executing anything in it:

- **Unpacked root filesystem.** When the scanned directory contains `etc/os-release` (or `usr/lib/os-release`), it is read as a root filesystem alongside any Dockerfiles and Compose files in the repository.
- **Local root filesystem archive.** A directory that holds a top-level `.tar`, `.tar.gz`, or `.tgz` archive (at most four are read, up to 512 MiB each) is checked for an `os-release` member. The archive is streamed with that byte limit and a member cap; nothing is written to disk. A root filesystem archive such as `docker export` produces is read this way. A `docker save` image archive is not a root filesystem (it holds layers), so unpack it first.

The operating system comes from `ID`, `VERSION_ID`, and `VERSION_CODENAME` in `/etc/os-release` (or `/usr/lib/os-release`), and is judged with the same Ubuntu, Debian, and Alpine rules as a Docker Hub base image. When `VERSION_ID` is absent, a Debian or Ubuntu codename is used.

Runtimes come from these well-known paths:

| Runtime | Evidence |
| --- | --- |
| Node.js | `usr/local/include/node/node_version.h` or `usr/include/node/node_version.h` (`NODE_MAJOR_VERSION`, `NODE_MINOR_VERSION`, `NODE_PATCH_VERSION`) |
| Go | `usr/local/go/VERSION` or `usr/lib/go-<version>/VERSION` |
| Java | `release` under `usr/lib/jvm/*`, `opt/java/openjdk`, or `opt/java/*` (`JAVA_VERSION`) |
| Python | `usr/lib/pythonX.Y`, `usr/local/lib/pythonX.Y`, or `pythonX.Y` in `usr/bin` or `usr/local/bin` |
| Ruby | `usr/lib/ruby/X.Y.Z`, `usr/local/lib/ruby/X.Y.Z`, or `rubyX.Y` in `usr/bin` or `usr/local/bin` |
| PHP | `phpX.Y` or `phpXY` in `usr/bin` or `usr/local/bin` |
| .NET | `usr/share/dotnet/shared/Microsoft.NETCore.App/X.Y.Z` or `usr/lib/dotnet/shared/Microsoft.NETCore.App/X.Y.Z` |

Each runtime version uses the same rules as a Dockerfile `RUN` pin. Installed release lines are reported, not individual patches: an image that keeps two Python release lines gets a finding for each one a rule covers, while Java reports one finding per major, .NET one per `major.minor` line, and Ruby's `3.1` and `3.1.0` are the same line. A runtime with no end-of-life rule (for example Python 3.12) produces nothing.

For an archive, a finding's location names the member, such as `image.tar!etc/os-release` or `image.tar!usr/local/go/VERSION`. For an unpacked directory it is the path itself, such as `etc/os-release`.

## What it matches

Docker Hub official images: `node`, `python`, `postgres`, `mysql`, and `ruby` (`node`, `library/node`, and `docker.io/library/node` are the same image). Images from other registries or organizations (`ghcr.io/acme/node`, `myorg/node`) are never matched, with one exception.

**Microsoft .NET images.** `mcr.microsoft.com/dotnet/sdk`, `aspnet`, `runtime`, and `runtime-deps` (and `dotnet/core/*`, where the same images lived before .NET 5) are matched, because their tags name a .NET release line: `sdk:6.0` is .NET 6. They are judged with the [`dotnet` runtime rules](dotnet.md) (`dotnet.runtime.end-of-support-*`, with Microsoft's support policy and releases index as sources), not with a copy of them, so a rule changes in one place. A tag `X.Y` or `X.Y.Z` is the line `X.Y`; the variant suffixes Microsoft publishes (`-alpine3.19`, `-bookworm-slim`, `-jammy-chiseled`, `-cbl-mariner2.0`, `-azurelinux3.0`, `-amd64`, `-nanoserver-1809`) are accepted. A variable, `latest`, no tag, or an unrecognized suffix is unclassified. `dotnet/framework/*`, `dotnet/nightly/*`, and `dotnet/monitor` are never matched, and no other registry is.

A tag is read as a release line when it starts with a version and carries only a known variant suffix (`alpine`, `slim`, `bookworm`, `bullseye`, `jammy`, and similar). `node:18`, `node:18.20.4-alpine`, and `postgres:11.5-bullseye` are classified. A finding is reported only when **every** version the tag can stand for is inside the rule's range.

## What it intentionally does not judge

These are reported as [unclassified references](../DETECTORS.md#unclassified-references) (with file and line), never as findings and never guessed:

- a tag that is a build argument or variable, such as `node:${NODE_VERSION}` (Evergreen does not expand it; `$BASE_IMAGE` is skipped entirely because the image is unknown);
- `latest`, no tag, or a digest with no tag;
- a floating tag that spans supported and unsupported versions: `mysql:8` can mean 8.0 or 8.4, so it is not flagged, while `mysql:8.0` is;
- a tag with a suffix Evergreen does not recognize, such as `node:20-custom-build`.

Nothing is reported for `scratch`, a `FROM` that names an earlier stage, comments, `RUN` strings, Compose services built from a local Dockerfile (`build:`), Compose keys other than `services.*.image` (`container_name`, `labels`, extension fields), YAML aliases, or invalid files.

## Known limits and false-positive boundaries

- An image kept on an old release line **on purpose** (for example a compatibility test against `mysql:5`) is still reported. The rule states a vendor fact; whether the old version is intended is for the repository to decide, for example with a [baseline](../../README.md).
- A base image's tag does not reveal the operating system inside it. The OS is judged only when the image filesystem itself is scanned.
- A `docker save` image archive is not a root filesystem, so it is not read; export or unpack the image first. Package databases (`dpkg`, `apk`, `rpm`) are not read, so a runtime installed only as a distro package without a versioned path is not detected.
- Only the `ubuntu`, `debian`, and `alpine` OS IDs are matched. Another distribution, or an `os-release` without a usable version, produces no OS finding.
- Kubernetes manifests, Helm charts, Terraform, CI files, `docker buildx bake` files, and image registries are not read.
- `postgres` and `mysql` upgrades need a data migration; the rule's migration guidance says so, but Evergreen cannot check the data.

## Data

The rules are in `registry/container.json` and ship in the [data bundle](../DATA.md). The Node.js and Python rules are drafted by the `container-official-images` [importer](../IMPORTERS.md) from the vendors' own schedules; the PostgreSQL, MySQL, and Ruby rules are hand-written from each vendor's lifecycle page. The Docker Official Images repository is never used to decide support status. Each rule links its vendor source and carries migration steps and verification commands (`docker build .`, `docker run --rm IMAGE ... --version`).

Operating-system and runtime findings reuse the existing container and runtime registries (`registry/container.json`, `registry/nodejs.json`, `registry/python.json`, `registry/ruby.json`, `registry/php.json`, `registry/java.json`, `registry/go.json`, and `registry/dotnet.json`). Scanning a root filesystem adds no network access and no new lifecycle data.

## Validation

Five public repositories at pinned commits are in the corpus (four with end-of-life images, one with none). Their expected findings were reviewed by hand against the files at that commit, and where the maintainers later moved off the image the note links their commit.

The .NET images are checked against SharpSocks, whose `SharpSocksServer/Dockerfile` uses `mcr.microsoft.com/dotnet/runtime:5.0` and `dotnet/sdk:5.0`; both lines are expected findings in the corpus.

The root filesystem path has a fixture at [`tests/fixtures/container-rootfs`](../../tests/fixtures/container-rootfs): an unpacked Debian 11 tree with Node.js 16, Go 1.20, Java 13, PHP 8.1, Python 3.9, Ruby 3.1, and .NET 6, plus a supported Python 3.12. `tests/container-rootfs.test.ts` asserts the OS and runtime findings, then packs the same tree into a tar, a gzip-compressed tar, and a tar with one top-level directory and asserts the same findings with archive member locations.
