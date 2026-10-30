---
title: "Is your repo affected? Alpine Linux 3.21 ends 2026-11-01"
---

# Is your repo affected? Alpine Linux 3.21 ends 2026-11-01

Alpine Linux 3.21 is scheduled to stop receiving security updates on **2026-11-01**. Images pinned to the 3.21 release line (`>=3.21.0` and `<3.22.0`) will no longer get vendor patches after that date. Move to a later supported Alpine release line before then.

## Who is affected

Repositories that declare `alpine:3.21` (or another 3.21.x tag) as a base image in Dockerfiles, Compose files, CI service containers, or deployment manifests. The [`container`](../detectors/container.md) detector reports those declarations when they match the 3.21 line.

## Check your repository

One command scans the local tree for this and other lifecycle rules. It reads repository files only; it does not use the network.

```bash
npx evergreen-deprecation scan
```

Look for rule `container.alpine.eol-3.21`. You can also check a single Package URL:

```bash
npx evergreen-deprecation check pkg:docker/library/alpine@3.21
```

## Migration steps

Replacement: an Alpine image on a later supported release line.

1. **Update the base image.** Change the reported `FROM` line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

Then verify with `docker build .` and a short `docker run` smoke check. Full constraints and verification commands are on the [rule page](../rules/container.alpine.eol-3.21.md).

## Sources

- [Alpine Linux releases](https://alpinelinux.org/releases/)
- Rule: [`container.alpine.eol-3.21`](../rules/container.alpine.eol-3.21.md)

Every claim above comes from the linked source and the reviewed rule. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
