# Detector authoring

Evergreen detectors are adapters at the detector SDK seam. They inspect a repository and return lifecycle findings; the scan engine handles detector attribution, sorting, reporting, and composition.

## Supported interface

Import the public SDK from `evergreen-deprecation/sdk`:

```ts
import {
  defineDetector,
  DETECTOR_API_VERSION,
  type Detector,
} from "evergreen-deprecation/sdk";
```

A compatible detector has one stable identifier and one operation:

```ts
export const detector = defineDetector({
  apiVersion: DETECTOR_API_VERSION,
  id: "example-ecosystem",
  async scan({ root }) {
    return [];
  },
}) satisfies Detector;
```

The interface guarantees:

- `root` is an absolute repository path.
- `id` uses lowercase letters, numbers, and single hyphens.
- `scan` returns findings without a `detector` field; the engine adds it from `id`.
- Findings must be deterministic for the same repository and bundled registry.
- Repository contents are untrusted input.
- The core contract provides no network capability. Detectors should use bundled, reviewed registry data so scans remain local and reproducible.
- An incompatible `apiVersion` fails before the detector scans.

See [`examples/detectors/todo-comments.ts`](../examples/detectors/todo-comments.ts) for a complete minimal adapter.

## Registry validation

The bundled registries use the shared `evergreen.registry.v2` format, keyed by Package URL and version range with provenance for every rule. See [Lifecycle rules](RULES.md) for the format, the evidence policy, and how to write a rule. The v2 loader is internal to the bundled detectors for now; the public SDK validates the v1-style envelope below, so detectors outside this repository keep working unchanged.

Registry files for external detectors use a versioned envelope:

```json
{
  "schemaVersion": "example.registry.v1",
  "rules": []
}
```

Use `validateRegistry` for the envelope and a detector-owned type guard for each rule:

```ts
const registry = validateRegistry(JSON.parse(contents), {
  schemaVersion: "example.registry.v1",
  isRule: (value): value is ExampleRule =>
    isDeprecationRule(value) && typeof value.package === "string",
});
```

Validation rejects a missing or unexpected schema version, a non-array `rules` value, and the first invalid rule with its array index. `isDeprecationRule` validates the fields shared by every Evergreen lifecycle rule.

Rules may include optional migration guidance so `evergreen context` can produce ecosystem-specific packets without hard-coding detector knowledge in the CLI:

```json
{
  "migration": {
    "constraints": ["Preserve observable behavior."],
    "steps": [
      {
        "id": "replace-declaration",
        "title": "Replace the declaration",
        "instructions": "Move to the supported replacement.",
        "targets": "declaration"
      }
    ],
    "verification": [
      { "command": "npm test", "purpose": "Run the repository tests." }
    ]
  }
}
```

Step targets are `declaration`, `usages`, or `all`. The packet module resolves those targets to exact repository paths. Step IDs must be unique within a rule, and constraints, steps, and verification commands must all be non-empty. External detectors without migration guidance receive deterministic generic fallback steps.

## Source usage contracts

Detectors can enrich findings with concrete repository usages through the public `analyzeSourceUsage` helper. Pass all matched rules in one batch so the repository is traversed once:

```ts
import {
  analyzeSourceUsage,
  type SourceUsageContract,
} from "evergreen-deprecation/sdk";

const contracts: SourceUsageContract[] = [{
  id: "legacy-client",
  matchers: [
    { kind: "import", language: "typescript", module: "legacy-client" },
    {
      kind: "call",
      language: "typescript",
      module: "legacy-client",
      targets: ["default", "get"],
    },
  ],
}];

const analyses = await analyzeSourceUsage(root, contracts);
```

Import and call matchers resolve common aliases in JavaScript, TypeScript, and Python. Configuration-key matchers support Python settings plus JSON, YAML, TOML, and INI-style files, and can optionally require a value fragment. Results include exact locations, excerpts, and a deterministic `none`, `low`, `medium`, or `high` migration-impact estimate. Keep matchers narrow: a lifecycle finding may safely have zero source usages, but an ambiguous match should not be reported as evidence.

## Compatibility policy

`evergreen.detector.v1` remains compatible throughout the `0.1.x` line. Additive fields will be optional. A future breaking interface will use a new API version so an old adapter fails clearly instead of producing unreliable findings.

Run `npm run check` against the minimum Evergreen version your detector supports. The repository compatibility suite exercises an external adapter, rejects an old API version, validates registry failure modes, and runs the published example through the same engine seam used by built-in detectors.
