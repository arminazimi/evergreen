---
title: "Go 1.21 is no longer supported"
description: "The Go release policy supports a major release until two newer major releases exist. Go 1.21 support ended when Go 1.23 was released."
---

# Go 1.21 is no longer supported

The Go release policy supports a major release until two newer major releases exist. Go 1.21 support ended when Go 1.23 was released.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `go` |
| Component | `pkg:generic/golang` |
| Affected versions | `vers:golang/>=1.21.0\|<1.22.0` |
| Date from the source | 2024-08-13 |
| Replacement | Go 1.26 or later |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-04-14 (180 days after the last review) |
| Rule ID | `go.runtime.end-of-support-1.21` |

## Sources

- [Go release history and support policy](https://go.dev/doc/devel/release)

## Migration

**Constraints**

- Keep go.mod, go.work, CI matrices, and container images on one supported Go release.
- Check that every dependency's own go directive is compatible with the target toolchain.

**Steps**

1. **Raise the Go version.** Raise the reported `go` or `toolchain` line from Go 1.21 to a supported release (see the replacement), for example with `go get go@<version> toolchain@<version>`.
2. **Align other Go version surfaces.** Update CI setup-go versions, Dockerfile `golang:` images, and other go.mod or go.work files in the repository so they agree.

**Verification**

- `go version`: Confirm the active toolchain is the intended release.
- `go build ./... && go test ./...`: Build and test every package on the new release.
- `go vet ./...`: Catch problems the newer release reports.

## Detected by

The [`go`](../detectors/go.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/go.json`](https://github.com/arminazimi/evergreen/blob/main/registry/go.json), rule `go.runtime.end-of-support-1.21`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
