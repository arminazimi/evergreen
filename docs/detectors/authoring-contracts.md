---
title: Detector contracts
---

{% raw %}
# Detector contracts

The contracts around a detector: the files it declares it reads, the registry envelope it validates, and the source-usage helper it can call. The authoring guide starts at [Detector authoring](../DETECTORS.md).

## Declaring the files a detector reads

A detector may declare, in one place, which repository files its `scan` reads. The optional `inputs` field on `Detector` (added to the `evergreen.detector.v1` interface without changing anything that exists) has four parts, all relative to the scanned root with forward slashes:

| Field | Meaning |
| --- | --- |
| `fileNames` | Exact base names at any depth, case-insensitive; `*` matches any run of characters (`requirements*.txt`, `*.Dockerfile`). |
| `extensions` | Base-name endings, including the dot (`.csproj`). |
| `directories` | Directories, at the root or below any directory, all of whose files may be read (`.github/workflows`). |
| `sourceExtensions` | Source files read to map usage of a deprecated API (`.ts`, `.cs`). |

```ts
readonly inputs: DetectorInputs = {
  fileNames: ["go.mod", "go.work"],
  sourceExtensions: [".go"],
};
```

Every built-in detector declares it, and a test fails if one does not. `declaredInputsCheck` (`evergreen/conformance`, from `src/conformance/checks/inputs.ts`) scans a fixture while recording every file whose contents the scan opens, and fails naming each file outside the declaration:

```text
Detector "leaky" violated the "declared inputs" guarantee for fixture "leak": read "secrets/token.txt", which its inputs do not declare
```

Listing a directory or testing that a path exists is not a read, and files outside the scanned root (the bundled rules) are ignored. A detector that omits `inputs` makes no promise and passes the check. The declaration is what a tool needs to fetch only the files a detector reads; keep it as narrow as the detector's real behavior, and widen it in the same change that makes the detector read something new.

## Detector limits

`DETECTOR_LIMITS` (exported from `evergreen-deprecation/sdk`, typed as `DetectorLimits`) is the one place the bounds of `evergreen.detector.v1` are written down. A finding must not come from a file larger than `maximumFileBytes` (1,000,000), from a path more than `maximumDirectoryDepth` (32) directories below the root, or from a vendored or generated directory in `vendoredDirectories` (`node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`). `boundsCheck` reads the same constant, so the documented limit and the enforced limit cannot drift. A detector may be stricter, never looser.

Together with the contract above, a detector's typed surface is: `inputs` (the files it reads), `DetectorFinding` (what it reports, with an optional `confidence` the engine derives when omitted), and `DETECTOR_LIMITS` (how far it may look). Start a new one with `new-detector`, which generates a skeleton that already satisfies all three.

## Registry validation

The bundled registries use the shared `evergreen.registry.v2` format, keyed by Package URL and version range with provenance for every rule. See [Lifecycle rules](../RULES.md) for the format, the evidence policy, and how to write a rule. The v2 loader is internal to the bundled detectors for now; the public SDK validates the v1-style envelope below, so detectors outside this repository keep working unchanged.

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

Import and call matchers resolve common aliases in JavaScript, TypeScript, and Python. Go supports import and call matchers by import path. Java and Kotlin support import matchers only (`language: "java"` for `.java` files and `"kotlin"` for `.kt` files): `module` is a package or class name, an import of it or of anything below it matches (`import static` and wildcard imports included), and calls through the imported names are not mapped. Ruby supports import and call matchers (`language: "ruby"` for `.rb`, `.rake`, and `.ru` files): `module` is a require path, a literal `require`, `load`, `gem`, or `autoload` of that path (or a path under it) is an import, and a call target is a qualified call such as `JSON.parse(` (parentheses required). An assignment `Parser = JSON` makes `Parser.parse(` the same call. A dynamic `require`/`load`/`gem`/`autoload` argument is reported as unclassified instead of being guessed; `require_relative` is not. Configuration-key matchers support Python settings plus JSON, YAML, TOML, and INI-style files, and can optionally require a value fragment. Results include exact locations, excerpts, and a deterministic `none`, `low`, `medium`, or `high` migration-impact estimate. Keep matchers narrow: a lifecycle finding may safely have zero source usages, but an ambiguous match should not be reported as evidence.

{% endraw %}
