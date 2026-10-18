# Capability manifest and auto-discovery contract

Evergreen publishes one deterministic capability manifest for humans, agents, and
integrations:

```bash
evergreen capabilities --json
```

The output uses the `evergreen.capabilities.v1` contract. Its JSON Schema is
[`schemas/capabilities.v1.schema.json`](../schemas/capabilities.v1.schema.json),
and a complete committed example is
[`examples/capabilities.json`](../examples/capabilities.json).

## What the manifest describes

- the Evergreen package and product version;
- supported, experimental, and unsupported capabilities;
- supported detector ecosystems and their maturity;
- CLI, MCP, Skill, plugin, and CI surfaces and their entry points;
- the shared capability identifiers available through each surface; and
- compatibility rules for consumers reading newer manifests.

## Detector maturity

Each ecosystem carries a `maturity` field next to its existing `status`:

| `maturity` | Shown in the docs as | What it promises users |
| --- | --- | --- |
| `experimental` | Experimental | The detector runs and is usable. Findings, rule ids, and unclassified output may change between releases without notice. |
| `beta` | Beta | Findings were measured against independent ground truth. Rule and finding ids are listed in the changelog when they change. |
| `stable` | Supported | The same promise as beta on a larger and more varied corpus, as part of the documented product contract. |

`maturity` is the detector's `level` in
[`benchmarks/thresholds.json`](../benchmarks/thresholds.json), which is the single
source of truth for [decision 0013](decisions/0013-detector-maturity.md). It is not
a second, independent judgment.

An ecosystem's `maturity` is the lowest level among the detectors listed in its
`detectorIds`. When several detectors serve one ecosystem, the ecosystem is only as
mature as its least mature detector. Today `nodejs` and `npm` both list the `npm`
detector, so both take its level. A contract test fails when the manifest disagrees
with `benchmarks/thresholds.json`.

The existing `status` field keeps its meaning and is not replaced: it says whether
the ecosystem is a supported product surface, while `maturity` records the evidence
level of the detectors behind it. A reader that ignores unknown fields can keep
using `status` exactly as before; `maturity` is an additive optional field in the
v1 manifest.

Capability identifiers describe behavior, not transport. For example,
`repository.scan` is the same capability when reached through the CLI, local MCP
server, Agent Skill, experimental host plugin, or CI. Integrations should compare
identifiers rather than infer behavior from command or tool names.

## Forward compatibility

Consumers of a v1 manifest must follow the compatibility object included in the
document:

1. Ignore fields they do not understand within schema major version 1.
2. Ignore unknown capability and surface identifiers rather than failing the whole
   manifest.
3. Treat any unlisted capability or ecosystem as unsupported. Absence never means
   experimental or supported.
4. Reject an unknown schema major version until the consumer explicitly supports
   it.
5. Use each entry's `status`; do not promote `experimental` or `unsupported`
   behavior based on a matching entry-point name.

New optional fields, identifiers, and surfaces using the defined statuses can be
added in a compatible v1 minor manifest update. Removing or redefining an existing
identifier, changing required field meaning or status vocabulary, or weakening the
rules above requires a new schema major version.

## Stability and privacy

The command reads a packaged constant and performs no repository scan, network
request, telemetry, or configuration write. Identical Evergreen versions produce
byte-for-byte identical JSON output. The package's contract tests validate both the
CLI output and committed example against the public JSON Schema and ensure every
surface references registered capability identifiers.
