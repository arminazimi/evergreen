# 0034 — Publish the detector limits in the SDK

Status: accepted

## Problem

The detector contract already types a detector's inputs (`DetectorInputs`), its findings (`DetectorFinding`, with
an optional `confidence`), and ships one shared conformance suite and a `new-detector` template. The limits were the
missing part: the 1,000,000-byte file ceiling, the 32-directory depth ceiling, and the vendored directories no
finding may come from existed only as private constants in the conformance bounds check. An author outside the
repository could not import them, and the docs could not point at a single source.

## Decision

1. `src/sdk.ts` exports `DetectorLimits` and the frozen `DETECTOR_LIMITS` value holding those three bounds.
2. `boundsCheck` reads `DETECTOR_LIMITS`; its `CONFORMANCE_MAXIMUM_*` exports keep their names and values.
3. The change is additive. `evergreen.detector.v1` is unchanged, no detector is required to read the value, and
   no bound changes.

## Alternatives rejected

- **A `limits` field on `Detector`.** Per-detector limits would let a detector declare looser bounds than the
  contract promises. The bounds are a property of the interface version, not of one detector.
- **Leaving the constants in conformance.** They stay unimportable and undocumented as part of the contract.
