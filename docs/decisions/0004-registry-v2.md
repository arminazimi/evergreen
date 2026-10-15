# 0004 — Key lifecycle rules by PURL and VERS with provenance

Status: accepted

## Decision

Lifecycle rules move to one registry format, `evergreen.registry.v2` ([schema](../../schemas/registry.v2.schema.json)), shared by every ecosystem. Each rule carries:

- a canonical identity: a version-less [Package URL](https://github.com/package-url/purl-spec) (`purl`) and a [VERS](https://github.com/package-url/purl-spec/blob/master/VERSION-RANGE-SPEC.rst) range of affected versions (`vers`);
- a lifecycle `event`: `deprecated`, `end-of-support`, `end-of-life`, or `removed`;
- `provenance`: when the evidence was observed, when and by whom it was last reviewed, and the importer that drafted it, if any;
- optional ecosystem matching hints under `x-<ecosystem>` (for example `x-github-actions.supportedFromMajor`).

Runtimes without a registry PURL type use `pkg:generic/<name>` (for example `pkg:generic/nodejs`). Version schemes follow VERS: `npm`, `pypi`, `maven`, `nuget`, `gem`, `golang`, `cargo`, `composer`, and `semver` for other semantic versions.

Detectors keep their existing typed views. When a detector loads a v2 file, the loader merges the rule's `x-<ecosystem>` object into the rule and applies the detector's existing type guard, so v1 and v2 files produce identical findings. New detectors and new consumers (`checkDependency`, CLE export, SBOM enrichment) match with `purl` and `vers` directly. A registry test checks that `x-<ecosystem>` hints and `vers` agree.

## Why

Hand-written, detector-specific fields (`package`, `major`, `maximumVersion`, `supportedFromMajor`) cannot be imported from authoritative sources, exported as CLE (ECMA-428) or CycloneDX lifecycle data, or matched by tools that do not know each detector. PURL and VERS are the identifiers those standards already use. Provenance makes every claim auditable and lets scheduled tooling find stale evidence.

Keeping the hints during migration lets every registry move to v2 one file at a time with byte-identical scan output, instead of rewriting every detector at once.

## Consequences

- Scans stay offline and deterministic. Freshness is checked by maintainer tooling and scheduled CI, never by scans.
- Changing evidence still requires maintainer review; importers draft rules and diffs but never write the registry.
- v1 files remain loadable until every bundled registry is migrated; removing v1 support is a separate decision.
- `x-<ecosystem>` hints are transitional for existing detectors. New detectors should not add hints that `purl` and `vers` can express.
