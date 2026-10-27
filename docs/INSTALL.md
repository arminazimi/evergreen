---
title: Install
---

# Install

Evergreen runs on Node.js 22 or newer as an npm package, as a container image for Docker users, as standalone binaries, and as a GitHub Action. Every surface runs the same CLI, so a scan gives the same findings wherever it runs.

## Run the quickstart with npm

The npm package is the most direct path. It needs Node.js 22 or newer and nothing else:

```bash
npx evergreen-deprecation scan .
```

## Run the quickstart with Docker

The container image is published to `ghcr.io/arminazimi/evergreen` with the release version, and `latest` for stable releases. Mount the repository at `/workspace` and scan it; scans use no network, so the container runs with it disabled:

```bash
docker run --rm --network none --read-only -v "$PWD:/workspace:ro" \
  ghcr.io/arminazimi/evergreen:latest scan /workspace
```

Pass `--platform linux/amd64` on an arm64 host such as Apple Silicon, because the image is published for `linux/amd64`:

```bash
docker run --rm --platform linux/amd64 --network none --read-only -v "$PWD:/workspace:ro" \
  ghcr.io/arminazimi/evergreen:latest scan /workspace
```

The machine-readable formats work the same way:

```bash
docker run --rm -v "$PWD:/workspace:ro" \
  ghcr.io/arminazimi/evergreen:latest scan /workspace --format compact
```

Because the scan runs inside the image exactly as the npm package runs it, the JSON is the same: same schema version, same findings at the same file and line. Only the `root` field differs, because the repository is mounted at `/workspace`.

## Standalone binaries and other hosts

Each release also attaches standalone binaries that need no Node.js; see [Releasing](RELEASING.md#standalone-binaries). For pull requests, use the [GitHub Action](GITHUB_ACTION.md).
