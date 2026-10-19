# Lifecycle rules

Every lifecycle claim Evergreen makes comes from a rule in `registry/`. A rule says which component is affected, in which versions, what happened to it, who says so, and when that was last checked. This page is the reference for writing one.

The format is `evergreen.registry.v2`. Its JSON Schema is [`schemas/registry.v2.schema.json`](../schemas/registry.v2.schema.json), and the reasoning is in [Decision 0004](decisions/0004-registry-v2.md). All five bundled registries (`container`, `github-actions`, `nodejs`, `npm`, `python`) use it.

## A complete rule

```json
{
  "schemaVersion": "evergreen.registry.v2",
  "ecosystem": "npm",
  "freshness": { "maxReviewAgeDays": 365 },
  "rules": [
    {
      "id": "npm.package.request.deprecated",
      "ecosystem": "npm",
      "purl": "pkg:npm/request",
      "vers": "vers:npm/*",
      "event": "deprecated",
      "title": "request is deprecated",
      "summary": "The package is fully deprecated and no new changes are expected.",
      "severity": "high",
      "replacement": "Native fetch or a maintained HTTP client",
      "deadline": "2020-02-11",
      "sources": [
        { "title": "request package deprecation notice", "url": "https://www.npmjs.com/package/request" }
      ],
      "provenance": {
        "observedAt": "2026-10-13",
        "reviewedAt": "2026-10-14",
        "reviewer": "arminazimi"
      },
      "migration": {
        "constraints": ["Preserve request method, headers, authentication, redirects, and error semantics at each call site."],
        "steps": [
          { "id": "replace-request-calls", "title": "Rewrite request usages", "instructions": "Translate each reported import and call to native fetch or a maintained client.", "targets": "usages" }
        ],
        "verification": [
          { "command": "npm run test --if-present", "purpose": "Run the repository tests when defined." }
        ]
      },
      "usage": [
        { "kind": "import", "language": "javascript", "module": "request" }
      ],
      "x-npm": { "package": "request" }
    }
  ]
}
```

A second, smaller example lives in [`examples/registry.v2.example.json`](../examples/registry.v2.example.json). The bundled files in `registry/` are the best reference for each ecosystem.

## The registry file

| Field | Required | Meaning |
|---|---|---|
| `schemaVersion` | yes | Always `evergreen.registry.v2`. |
| `ecosystem` | yes | A lowercase slug such as `npm`. Every rule in the file must use the same value. |
| `freshness.maxReviewAgeDays` | no | How long a rule may go without review before the weekly check reports it stale. Defaults to 365. |
| `rules` | yes | The rules, in the order detectors should consider them. |

## A rule

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable and unique, lowercase with dots and hyphens, for example `npm.package.request.deprecated`. Baselines and reports refer to it, so do not rename it. |
| `ecosystem` | yes | Matches the registry's `ecosystem`. |
| `purl` | yes | The affected component as a [Package URL](https://github.com/package-url/purl-spec), canonical and **without a version**: `pkg:npm/request`, `pkg:npm/%40angular/core`, `pkg:pypi/django-nose`, `pkg:github/actions/checkout`. Runtimes with no registry use `pkg:generic/<name>`, for example `pkg:generic/nodejs`. |
| `vers` | yes | The affected versions as a [VERS](https://github.com/package-url/vers-spec) range, for example `vers:npm/*` (every version), `vers:semver/<5.0.0`, `vers:semver/>=20.0.0\|<21.0.0`, `vers:pypi/<3.10`. Write it in canonical form: no spaces, no explicit `=`, constraints sorted by version. |
| `event` | yes | What happened, or what has been announced: `deprecated`, `end-of-support`, `end-of-life`, `removed`, or `scheduled-end-of-life`. Use the word the source uses; see [Choosing an event](#choosing-an-event). |
| `title` | yes | One line that names the problem. |
| `summary` | yes | One or two sentences stating what the source says, without advice. |
| `severity` | yes | `info`, `low`, `medium`, `high`, or `critical`. |
| `replacement` | no | What to move to. |
| `deadline` | no | The date from the source, as `YYYY-MM-DD`. Omit it when the source gives none. |
| `sources` | yes | At least one authoritative source, each with a `title` and an `https` `url` (and optionally `accessedAt`). |
| `provenance` | yes | See below. |
| `migration` | no | Constraints, ordered steps, and verification commands. Used by `evergreen context`. Step `targets` are `declaration`, `usages`, or `all`; step ids are unique within the rule. |
| `usage` | no | Imports, calls, configuration keys, and deprecated symbols that show where a repository depends on the component. See [Symbol-level usage](#symbol-level-usage). |
| `x-<ecosystem>` | no | Matching hints the ecosystem's detector reads, such as `x-npm.package`, `x-nodejs.major`, `x-python.kind`, or `x-github-actions.supportedFromMajor`. See [Detector hints](#detector-hints). |

### Symbol-level usage

A `usage` entry of kind `symbol` marks one deprecated function, method, class, or option inside a module, so a rule can say `ReactDOM.render` is deprecated without flagging all of `react-dom`. `purl` and `vers` still say which package versions are affected; the entry says which symbol.

| Field | Required | Meaning |
|---|---|---|
| `kind` | yes | `symbol`. |
| `language` | yes | `javascript`, `typescript`, or `python`. Write one entry per language. |
| `module` | no | The module that exports the symbol, as it is imported: `react-dom`, `datetime`. Omit it for globals and builtins such as `Buffer` or `open`. |
| `symbol` | yes | Dotted path from the module: `render`, `Buffer.alloc`, `datetime.utcnow`. Identifier segments only. |
| `shape` | yes | How the symbol is used: `call`, `construct` (`new X()`, JavaScript and TypeScript only), `reference` (any other use, such as passing it as a value), or `option` (a deprecated property in the call's options object). |
| `option` | when `shape` is `option` | The deprecated property name. Not allowed for other shapes. |
| `argument` | no | For `option`: zero-based position of the options argument. Defaults to the last argument. |
| `replacement` | no | What to use instead of this symbol. It overrides the rule's `replacement` in reports. |

Symbol entries are read by parser-backed usage analysis. Regex-based analysis ignores them, so a rule that has only symbol entries reports the declaration but no usages until that analysis runs. Add an `import` entry for the module as well when you want the regex scanner to find it. Each symbol entry needs its own evidence: the rule's `sources` must name the symbol, not only the package.

A complete rule, also in [`examples/registry.v2.symbol.example.json`](../examples/registry.v2.symbol.example.json):

```json
{
  "schemaVersion": "evergreen.registry.v2",
  "ecosystem": "npm",
  "freshness": {
    "maxReviewAgeDays": 365
  },
  "rules": [
    {
      "id": "npm.symbol.react-dom.render.deprecated",
      "ecosystem": "npm",
      "purl": "pkg:npm/react-dom",
      "vers": "vers:npm/>=18.0.0",
      "event": "deprecated",
      "title": "ReactDOM.render is deprecated",
      "summary": "React 18 deprecates ReactDOM.render; it runs the app in React 17 mode and logs a warning.",
      "severity": "medium",
      "replacement": "createRoot from react-dom/client",
      "sources": [
        {
          "title": "React 18 upgrade guide: react-dom render",
          "url": "https://react.dev/blog/2022/03/08/react-18-upgrade-guide"
        }
      ],
      "provenance": {
        "observedAt": "2026-10-19",
        "reviewedAt": "2026-10-19",
        "reviewer": "arminazimi"
      },
      "migration": {
        "constraints": [
          "Keep the application's root container and rendered tree unchanged."
        ],
        "steps": [
          {
            "id": "use-create-root",
            "title": "Switch to createRoot",
            "instructions": "Replace each reported render call with createRoot(container).render(element).",
            "targets": "usages"
          }
        ],
        "verification": [
          {
            "command": "npm run test --if-present",
            "purpose": "Run the repository tests when defined."
          }
        ]
      },
      "usage": [
        {
          "kind": "import",
          "language": "javascript",
          "module": "react-dom"
        },
        {
          "kind": "symbol",
          "language": "javascript",
          "module": "react-dom",
          "symbol": "render",
          "shape": "call",
          "replacement": "createRoot(container).render(element)"
        },
        {
          "kind": "symbol",
          "language": "typescript",
          "module": "react-dom",
          "symbol": "render",
          "shape": "call",
          "replacement": "createRoot(container).render(element)"
        }
      ],
      "x-npm": {
        "package": "react-dom"
      }
    }
  ]
}
```

To add one: find the official deprecation notice for the symbol, copy the rule above, set `purl` and `vers` to the package versions the notice covers, write one `symbol` entry per language, and run `npm run check`.

### Provenance

Provenance makes a rule auditable.

| Field | Meaning |
|---|---|
| `observedAt` | The date you last saw the claim at its source. |
| `reviewedAt` | The date a maintainer last checked the rule against its sources. It must not be earlier than `observedAt`. |
| `reviewer` | Who reviewed it. |
| `importer` | The importer that drafted the rule, when one did. Omit it for hand-written rules. |

Dates are real calendar dates written `YYYY-MM-DD`; timestamps are rejected.

### Choosing an event

| Event | Use it when the source says |
|---|---|
| `deprecated` | The maintainer deprecated it, or put it in maintenance mode and recommends something else. |
| `end-of-support` | The release or version no longer receives support, for example because its runtime is gone. |
| `end-of-life` | The project or release line has reached end of life, is unmaintained, or is archived. |
| `removed` | The component, release, or service has been retired and no longer works. |
| `scheduled-end-of-life` | The vendor has announced a future end of life or end of support, with a date. The rule needs that date as its `deadline` and `severity: low`. It names the affected versions exactly as the later end-of-support or end-of-life rule will. When the date has passed, a reviewed change turns it into that rule (same `id`). See [decision 0010](decisions/0010-scheduled-end-of-life.md). |

If the source's wording fits two events, use the earlier one and quote the source in `summary`.

## Evidence policy

- Every rule needs an authoritative, versioned source: maintainer release notes, an official support or end-of-life policy, a registry deprecation flag, or platform documentation.
- Never infer lifecycle status from popularity, download counts, or a newer version existing.
- Dates, affected versions, and replacements must match the source. If the source is ambiguous, say so in the pull request.
- Rules are reviewed data, not code. Changes to `registry/` and `schemas/` are reviewed by a maintainer (see `.github/CODEOWNERS`).

## Validation

Everything above is enforced when a registry loads, and `npm run check` runs it on the bundled files. Validation reports every problem at once and names the rule and field, for example:

```text
Invalid registry (2 problems):
- rule "npm.package.request.deprecated": provenance.reviewedAt is required
- rule "npm.package.left-pad.deprecated": purl must be canonical and version-less (expected "pkg:npm/left-pad")
```

Beyond the schema, validation checks that:

- `purl` is canonical and has no version, qualifiers, or subpath;
- `vers` is canonical, its scheme is supported, every version in it is valid for that scheme, and the scheme fits the PURL type (for example `pypi` ranges on `pkg:pypi`);
- ids are unique, the rule's `ecosystem` matches the registry's, and there are no unknown fields (extensions must be named `x-<name>`);
- `migration` and `usage` entries are valid.

Supported version schemes are `semver`, `npm`, `cargo`, `golang`, `composer` (Semantic Versioning), `pypi` (PEP 440), `maven`, `nuget`, `gem`, and `intdot`.

## Freshness and sources

Scans never check freshness and never use the network, so results stay deterministic. A weekly workflow, [`.github/workflows/sources.yml`](../.github/workflows/sources.yml), runs `tools/check-sources.ts` and reports, separately:

- **stale** rules, reviewed longer ago than their `freshness.maxReviewAgeDays`;
- **changed** sources, whose final URL or title differs from the one recorded in `registry/sources.lock.json`;
- **unreachable** sources;
- **blocked** sources behind a bot challenge, which cannot be verified;
- **unrecorded** sources, not in the lock yet.

The check never edits rules. When it reports something, review the source, update the rule and its `reviewedAt`, and refresh the lock:

```bash
npm run build
node dist/tools/check-sources.js --update-lock
```

Run it locally with `npm run check:sources`.

## Detector hints

Existing detectors read a few fields that are specific to their ecosystem. In v2 they sit under `x-<ecosystem>` and are merged into the rule when the registry loads, so a detector sees the same rule it always has.

| Registry | Hints |
|---|---|
| `npm` | `x-npm.package` |
| `nodejs` | `x-nodejs.major` for one release line, or `x-nodejs.maximumMajor` for every line up to and including it |
| `python` | `x-python.kind` (`runtime` with `maximumVersion` such as `"3.9"`, or `package` with `package`) |
| `github-actions` | `x-github-actions.action` and `x-github-actions.supportedFromMajor` |

The hints must agree with `purl` and `vers`: `x-npm.package` is the package in `pkg:npm/...`, and `x-github-actions.supportedFromMajor: 5` goes with `vers:semver/<5.0.0`. New detectors should not add hints that `purl` and `vers` can already express.

## Drafting rules from sources

Rules do not have to be typed by hand. [Importers](IMPORTERS.md) read an authoritative source such as the Node.js release schedule or npm's deprecation flags and draft rules for you to review.

## Converting a v1 file

A tool converts registries written in the older, detector-specific format of the four bundled detectors. It derives `purl` and `vers` from the old fields, refuses to guess lifecycle events, and checks that every rule reads back unchanged:

```bash
npm run build
node dist/tools/registry-v1-to-v2.js registry/example.json \
  --observed-at 2026-10-13 --reviewed-at 2026-10-14 --reviewer your-name \
  --event example.rule.id=deprecated --out registry/example.json
```

## Detectors outside this repository

The public SDK still validates the v1 envelope (`validateRegistry`), so external detectors keep working unchanged. Loading v2 registries is currently internal to the bundled detectors; see [detector authoring](DETECTORS.md#registry-validation).
