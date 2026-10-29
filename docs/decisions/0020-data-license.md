# 0020 — License the lifecycle dataset under CC BY 4.0

Status: accepted

## Problem

The lifecycle rules and schemas are the part of Evergreen most likely to be reused outside the scanner: other tools, agents, and researchers want the dates, not the CLI. The repository's Apache-2.0 license is written for software and does not say what applies to a compiled database, and the data-only package `evergreen-data` inherited the root package's `license` field by construction. Without a deliberate choice, every downstream consumer has to guess, and the project's own rule — a lifecycle claim needs an authoritative, cited source — stops at the repository boundary instead of travelling with the data.

## Decision

The lifecycle dataset is licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**. It covers the registry JSON in `registry/` and the first-party schemas in `schemas/` as published in the data-only package `evergreen-data`. Everything else in the repository — scanner, CLI, MCP server, Action, skills, plugins, and tooling — stays Apache-2.0.

- `packages/data/package.json` declares `"license": "CC-BY-4.0"`; the packaging tool no longer copies the root package's license into the data manifest.
- The package ships `LICENSE` (the canonical CC BY 4.0 text) and `ATTRIBUTION.md` (creators, how to credit, what Evergreen contributes, and the upstream source families). The packaging tool copies both into the assembled package and the tarball check fails when either is missing.
- `LICENSE` and `ATTRIBUTION.md` are the only non-JSON files the data-only tarball check permits. Adding any other document or asset requires a new decision.
- The registry bundled inside the `evergreen-deprecation` package remains part of that Apache-2.0 package. CC BY 4.0 is non-exclusive, so publishing the same files under both terms is intentional.

## Why

- **Attribution is the point.** Every rule exists because an upstream page or package registry states the fact, and the registry already requires cited sources and a review date. CC BY 4.0 carries that obligation into redistribution, where CC0 would let a downstream copy drift from its evidence without credit.
- **It fits the content.** The dataset is factual metadata with Evergreen's own selection, normalization, and descriptive text. A data license describes that better than a software license, and CC BY 4.0 is well understood by data consumers and compatible with commercial and internal use.
- **Non-commercial and share-alike terms were rejected.** They would exclude the corporate and platform policy use the project targets, and share-alike would force downstream mixes of several datasets into terms their authors did not choose.
- **One license for the whole package.** The schemas define the data contract and ship only with the data, so licensing them together avoids per-file terms inside one tarball.

## Consequences

- Anyone redistributing the dataset, or a dataset built from it, names Evergreen, links the license, and indicates changes. `ATTRIBUTION.md` gives a copyable credit line, and the package ships it next to the data.
- The upstream facts remain subject to the terms of the pages that state them; this license does not relicense third-party pages or claim their trademarks. `ATTRIBUTION.md` says so explicitly.
- The data package's `license` field and the root package's are now independent. Changing either is a decision record, not a manifest edit.
- No runtime behavior changes: scans stay offline, findings and bundle formats are unchanged, and no client sends anything anywhere.
