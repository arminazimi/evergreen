---
title: Decision records
description: Index of the architecture, data, contract, and policy decisions behind Evergreen.
---

# Decision records

These records explain the choices behind Evergreen's architecture, data format, contracts, and
policy. Each one is accepted unless a later record supersedes it. Records are numbered in the order
they were written; this page groups them by theme.

## Detectors

| # | Title | Decision |
| --- | --- | --- |
| [0002](0002-go-ecosystem-support.md) | Add Go as a first-class detector ecosystem | Add evidence-backed Go runtime, toolchain, and direct-module lifecycle detection through the existing detector SDK, without requiring the Go toolchain or network access at scan time. |
| [0007](0007-container-detector.md) | Detect end-of-life container base images from Dockerfiles and Compose files | Add a `container` detector that reports base-image references whose release line has a vendor-published end of life. |
| [0008](0008-kubernetes-detector.md) | Detect removed and deprecated Kubernetes APIs in manifests, Helm charts, and kustomizations | Add a `kubernetes` detector that reports `apiVersion`/`kind` pairs the Kubernetes project has documented as deprecated or no longer served. |
| [0009](0009-java-detector.md) | Detect end-of-support JDK releases and relocated Maven dependencies in JVM projects | Add a `java` detector for pinned or targeted JDKs and Maven coordinates that a vendor or maintainer has documented as out of support or moved. |
| [0011](0011-rust-detector.md) | Detect unsupported Rust toolchains and abandoned or yanked crates | Add a `rust` detector that reads Cargo and toolchain files and reports lifecycle risks an authoritative source states. |
| [0012](0012-dotnet-detector.md) | Detect unsupported .NET targets and deprecated NuGet packages | Add a `dotnet` detector for unsupported .NET SDK/runtime lines and deprecated NuGet packages with publisher evidence. |
| [0013](0013-detector-maturity.md) | Detector maturity levels and the evidence to move between them | Use three levels — `experimental`, `beta`, and `stable` — with fixed evidence floors (fixtures, corpus size, precision, recall) to move between them. |
| [0014](0014-ci-images-detector.md) | Detect retired CI runner images | Add a `ci-images` detector that reports only image lifecycle risks the platform's authoritative documentation explicitly states. |
| [0015](0015-corpus-fetch-strategy.md) | Corpus fetch strategy: sparse checkout, concurrency 16 | Default the public-repository corpus to sparse checkout at concurrency 16, with cache invalidation keyed to detector input declarations. |

## Data and contracts

| # | Title | Decision |
| --- | --- | --- |
| [0004](0004-registry-v2.md) | Key lifecycle rules by PURL and VERS with provenance | Move every ecosystem to one `evergreen.registry.v2` format keyed by Package URL and VERS, with provenance on each rule. |
| [0005](0005-lifecycle-importers.md) | Draft lifecycle rules with importers; never write the registry | Let importers draft rules from one authoritative source; a person reviews every draft and changes `registry/` in a pull request. |
| [0006](0006-data-bundle.md) | Ship lifecycle data as a versioned, content-addressed bundle | Publish and consume lifecycle data as an `evergreen.data-bundle.v1` document separate from the code release. |
| [0010](0010-scheduled-end-of-life.md) | Record announced end-of-life dates that have not happened yet | Add a `scheduled-end-of-life` event for announced future ends, reported at low severity and promoted by a reviewed change after the date. |
| [0016](0016-cli-exit-codes.md) | CLI exit codes and error codes | Map failures to five fixed classes and exit codes: policy 1, usage 2, data 3, parse 4, internal 5. |
| [0017](0017-openeox-ingestion.md) | Do not read OpenEoX documents yet; keep CLE as the interchange target | Scans never read OpenEoX; do not ingest it until the Core Schema is final, and keep CLE as the standards interchange path. |
| [0020](0020-data-license.md) | License the lifecycle dataset under CC BY 4.0 | License `registry/` and first-party schemas in the data-only package under CC BY 4.0; keep the rest of the repository Apache-2.0. |

## Adoption

| # | Title | Decision |
| --- | --- | --- |
| [0018](0018-adoption-before-v1.md) | Ship v0.8.0 (adoption) and v0.9.0 (visibility) before v1 | Ship adoption then visibility before v1, with usage before attention, and record post-v1 ideas as unscheduled epics. |
| [0019](0019-privacy-first-adoption-metrics.md) | Privacy-first adoption metrics; opt-in telemetry only after v1 | Keep product telemetry off by default forever as the default; any opt-in comes only after a separate post-v1 decision. |

## Policy

| # | Title | Decision |
| --- | --- | --- |
| [0001](0001-typescript-first.md) | TypeScript-first, local-first architecture | Build v0.1 in TypeScript on Node.js 22 or newer, sharing one language across CLI, engine, detectors, Action, and MCP, with no hosted backend. |
| [0003](0003-shared-plugin-packaging.md) | Generate host plugins from shared Evergreen assets | Keep Skill, runtime, rules, and migration behavior as canonical shared sources and generate Codex and Claude plugins from them so CI fails on drift. |
