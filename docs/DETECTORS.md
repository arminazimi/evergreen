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

## Start a new detector in this repository

Do not copy an existing detector by hand. Generate the skeleton from a checkout of this repository:

```bash
npm ci
npm run build
node dist/src/cli.js new-detector go-modules --ecosystem go
```

The id is the detector's stable identifier (lowercase letters, digits, and single hyphens, starting with a letter). `--ecosystem` is the registry slug and defaults to the id. The command creates nine files and nothing else:

| File | What it is for |
| --- | --- |
| `src/detectors/<id>.ts` | The detector. It imports only the public SDK, reports nothing yet, and says in its header what to do next. |
| `src/detectors/<id>/parse.ts` | A pure, bounded parser: contents in, `{ value, line }` declarations out. Its header lists the rules it keeps and a place to document the forms it deliberately does not read. |
| `registry/<id>.json` | An empty `evergreen.registry.v2` registry for your rules ([Lifecycle rules](RULES.md)). |
| `tests/<id>-detector.test.ts` | The conformance suite (determinism, zero-finding, malformed input) against the generated fixtures. |
| `tests/<id>-parse.test.ts` | The invariants every parser keeps: no throw on junk, bounded input and lines, determinism, 1-based lines. |
| `tests/fixtures/<id>/` | A README with a table of cases, and `zero/` and `malformed/` fixtures to replace with real ones. |
| `docs/detectors/<id>.md` | The page that describes what the detector reads, its rules, and its limits. |

The skeleton compiles and passes its own tests with zero rules, so every later change starts from a green build. The command refuses to run outside a checkout, refuses an id or ecosystem that an existing detector, registry file, or rule-id prefix already uses (it lists every clash and the file that holds it), and writes nothing if any target file exists.

After generating:

1. **Fixtures first.** Fill `tests/fixtures/<id>/` with small repositories: one positive per declaration type, lookalike negatives (comments, unrelated keys, dynamic values), a zero-finding one, and a malformed one. Describe each in the README table.
2. **Parser.** Teach `parse.ts` to read the declarations, one form at a time, each with a test. Bound the input, never evaluate what you read, and return nothing, not an error, for forms you do not support.
3. **Rules.** Add evidence-backed rules to `registry/<id>.json` ([evidence policy](../CONTRIBUTING.md#evidence-policy)).
4. **Detector.** In `<id>.ts`, find the files, parse them, and match declarations to rules. Report an exact path and line. Add the expected findings to the conformance test.
5. **Register it.** Add the detector to `builtInDetectors` in `src/detectors/index.ts`. To ship its rules in the signed data bundle ([Lifecycle data](DATA.md)), add the ecosystem to `BUNDLED_ECOSYSTEMS` in `src/data-bundle.ts`. The generator leaves both to you on purpose, so a skeleton never changes what scans report or what a data release contains.
6. **Check.** `npm run check` must pass, and `npm run validate:public-repos` must still match exactly. A new detector starts non-stable in `benchmarks/thresholds.json` until the corpus has meaningful coverage ([Validation](VALIDATION.md#precision-thresholds)).

Detectors that live outside this repository use the public SDK directly, as described below; `new-detector` is for contributors to Evergreen itself.

## Unclassified references

Detectors may implement the optional `analyze` operation when they need to return both findings and references that could not be classified safely. The stable `scan` operation remains required, so existing external detectors continue to work unchanged. The engine adds the detector ID, sorts the references deterministically, and exposes them under `unclassified.count` and `unclassified.references` in `evergreen.scan.v1` JSON output.

The built-in GitHub Actions detector uses this metadata for full 40-character commit pins it cannot resolve. It classifies a covered action from a valid trailing version comment first, or from Evergreen's bundled exact SHA-to-release map when no comment is present. An unknown SHA is reported with reason `unknown-sha`; a present but unusable comment is reported with reason `invalid-version-comment`. Neither case becomes a lifecycle finding because Evergreen does not guess a release line.

This resolution is fully offline. The bundled map is reviewed and regenerated by a separate maintainer tool; repository scans never query GitHub or another service.

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
