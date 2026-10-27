# Standards support

Evergreen keys every lifecycle rule by [Package URL](https://github.com/package-url/purl-spec) (PURL) and [VERS](https://github.com/package-url/purl-spec/blob/master/VERSION-RANGE-SPEC.rst), and interops with CLE, CycloneDX, SPDX, and SARIF without inventing a parallel format. Scans stay offline: they read repository files and bundled (or pinned) data only.

## Support table

| Standard | Role in Evergreen | Status | How to use it |
|---|---|---|---|
| [PURL](https://github.com/package-url/purl-spec) | Component identity | Supported | Every rule’s `purl` (version-less); `evergreen check pkg:…`; CLE identifiers; SBOM matching |
| [VERS](https://github.com/package-url/purl-spec/blob/master/VERSION-RANGE-SPEC.rst) | Affected version ranges | Supported | Every rule’s `vers`; CLE `versions[].range`; matching in scans, checks, and SBOM enrichment |
| [CLE (ECMA-428)](https://ecma-international.org/publications-and-standards/standards/ecma-428/) | Lifecycle interchange | Supported | Export: `evergreen export --format cle`. Ingest: maintainer `cle.json` in installed packages during `evergreen scan` |
| [CycloneDX](https://cyclonedx.org/) | SBOM lifecycle | Supported | Enrich: `evergreen sbom enrich <bom.json>` (JSON 1.3–1.6). Input: check components that carry a `purl` with the same offline dependency API as `evergreen check` |
| [SPDX](https://spdx.dev/) | SBOM input | Supported | Check SPDX 2.3 JSON packages whose `externalRefs` include type `purl` |
| [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) | Findings output | Supported | `evergreen scan --format sarif`; GitHub Action `upload-sarif: true` |
| [OpenEoX](https://github.com/oasis-tcs/openeox) | Vendor EOL policy | Not read | [Decision 0017](decisions/0017-openeox-ingestion.md): CLE remains the interchange target until the OpenEoX Core Schema is final |

## PURL and VERS

Rules in `registry/` use a canonical, **version-less** PURL and a VERS range. Detectors and `evergreen check` match an observed version against that range. The rule format, evidence policy, and examples are in [Lifecycle rules](RULES.md); the design is [Decision 0004](decisions/0004-registry-v2.md).

```bash
evergreen check pkg:npm/request@2.88.2
evergreen check pkg:generic/nodejs@18.20.0
```

```json
{
  "purl": "pkg:npm/request",
  "vers": "vers:npm/*"
}
```

Runtimes without a registry type use `pkg:generic/<name>` (for example `pkg:generic/nodejs`). VERS schemes follow the component: `npm`, `pypi`, `semver`, and the other schemes listed in Decision 0004.

## CLE (ECMA-428)

CLE is the lifecycle document format Evergreen exports and, when a maintainer ships it, reads.

**Export.** Print one CLE 1.0 JSON document per component (NDJSON on stdout) from the active offline data:

```bash
evergreen export --format cle > lifecycle.ndjson
```

Only dated component-level `end-of-support`, `end-of-life`, and `scheduled-end-of-life` rules map faithfully. Soft deprecations, API removals, symbol-only rules, and undated rules are omitted; a count of skipped rules goes to stderr. Event `versions[].range` keeps the rule’s VERS string; `identifier` is the rule’s PURL. Output validates against the CLE 1.0 schema.

**Ingest.** During `evergreen scan`, Evergreen looks for `cle.json` next to `package.json` under `node_modules`. The document’s `identifier` must match the installed package as a PURL, and the installed version must fall in an event’s VERS range. How to ship a document: [Declaring lifecycle for your package](MAINTAINERS.md).

## CycloneDX

**Enrich.** Add official `cdx:lifecycle` milestone properties and evidence URLs to a copy of a CycloneDX JSON BOM. The input file is never modified. Spec versions 1.3 through 1.6 are accepted. Components match by PURL (and version from the PURL or the component `version` field) against the same offline rules as dependency checks. Undated, symbol-only, and version-dependent claims are not written as milestones.

```bash
evergreen sbom enrich bom.json > bom.enriched.json
```

Example property names Evergreen may add:

- `cdx:lifecycle:milestone:endOfSupport`
- `cdx:lifecycle:milestone:endOfLife`

**Input.** A CycloneDX JSON BOM can be checked offline: each component with a `purl` is run through the same dependency check as `evergreen check`. Nested and metadata components are included; components without a PURL are skipped. Results stay explicit for `no-data` and version-dependent cases.

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "components": [
    {
      "type": "library",
      "name": "request",
      "version": "2.88.2",
      "purl": "pkg:npm/request"
    }
  ]
}
```

## SPDX

Evergreen reads **SPDX 2.3 JSON** documents. For each package, it checks `externalRefs` whose `referenceType` is `purl` (case-insensitive). A version in the PURL wins over `versionInfo`. Packages and refs without a PURL are skipped. The document is never written.

```json
{
  "spdxVersion": "SPDX-2.3",
  "packages": [
    {
      "name": "request",
      "SPDXID": "SPDXRef-request",
      "versionInfo": "2.88.2",
      "externalRefs": [
        {
          "referenceCategory": "PACKAGE-MANAGER",
          "referenceType": "purl",
          "referenceLocator": "pkg:npm/request"
        }
      ]
    }
  ]
}
```

## SARIF

`evergreen scan --format sarif` emits deterministic SARIF 2.1.0. Paths are repository-relative with forward slashes; rules and results are sorted; no scan timestamp or absolute checkout path is written. The GitHub Action can upload the same file to code scanning (`upload-sarif: true`). Field mapping and privacy notes: [GitHub Action — SARIF output](GITHUB_ACTION.md#sarif-output).

```bash
evergreen scan . --format sarif > evergreen.sarif
```

## What Evergreen does not do with these standards

- Scans never fetch CLE, SBOMs, or OpenEoX over the network.
- CLE export does not invent end-of-life claims for soft deprecations or API removals.
- CycloneDX enrichment never removes existing BOM fields; it only adds properties and documentation references.
- OpenEoX documents are not ingested; see [Decision 0017](decisions/0017-openeox-ingestion.md).
