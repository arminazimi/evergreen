# Comparison with endoflife.date

This directory holds the measured comparison with endoflife.date, run under
[docs/COMPARISON_METHOD.md](../../docs/COMPARISON_METHOD.md). It answers two questions:

1. **Product coverage:** which release-cycle products does each side cover?
2. **Data correctness:** when both sides publish a lifecycle date for the same release cycle, do they agree, and
   which side matches the date the ground-truth audit checked against the vendor?

The result is committed as [endoflife-date.json](endoflife-date.json) (the data) and
[endoflife-date.md](endoflife-date.md) (the tables). Both are generated; do not edit them by hand.

## What is compared

* **Evergreen:** every rule in `registry/*.json`. A rule is scored only when its purl maps to an endoflife.date
  product, its event is a lifecycle event (`end-of-life`, `scheduled-end-of-life`, or `end-of-support`), and its
  `vers` range covers at least one release cycle.
* **endoflife.date:** the committed snapshot in
  [endoflife-date.snapshot.json](endoflife-date.snapshot.json), a projection of
  `https://endoflife.date/api/all.json` and the per-product endpoints retrieved on the date in the file. The
  projection keeps `cycle`, `eol`, and `support`; every other field is dropped. The data is MIT-licensed; see
  [LICENSE-endoflife-date.txt](LICENSE-endoflife-date.txt).
* **Ground truth:** the 557-repository pinned corpus. Its 197 distinct expected rule ids are the sample for the
  ground-truth table, and the vendor-checked dates in its notes decide correctness.

A rule's `vers` range is compared with the release cycles it covers. A single cycle (`>=20.0.0|<21.0.0`) is
compared with that cycle's date; a group (`<22.0.0`, "22 and older") with the latest date among its members,
because a group is fully ended only when its last member ends.

## Field policy

| Rule event | endoflife.date field |
| --- | --- |
| `end-of-life`, `scheduled-end-of-life` | `eol` |
| `end-of-support` | `support`, falling back to `eol` when the product publishes only one boundary |
| any AWS Lambda runtime | `support` — Evergreen records AWS's deprecation date, which the API publishes as `support` |

The snapshot's `eol: false`, `support: true`, and similar flags mean "no date"; a rule covering such a cycle is
counted in the `no-endoflife-date` bucket instead of being scored.

## What is not compared, and why

The comparison scores release-cycle products only. The other families are listed with a reason in the result,
never silently dropped:

* per-package deprecation and support findings, including framework release lines (npm, PyPI, Composer, Cargo,
  NuGet, Go modules, Maven, Hex, pub);
* Kubernetes API retirements and Helm repository retirements;
* GitHub Actions runtime requirements and workflow-command removals;
* mobile store, billing, App Store, and deployment-target policies;
* hosted CI image retirements and managed platform runtime policies;
* Dockerfile syntax and CMake policy deprecations.

AKS and GKE are not compared: Evergreen records the end of extended or LTS support there, while endoflife.date
publishes the standard-support boundary, so the dates describe different events. EKS is compared because its
boundary matches. The excluded families are counted under the `different-support-model` reason, not dropped.

## Reading the result

* **Agreement** is `agree / measured`. A disagreement is a date difference with both sources linked; it is not a
  verdict. The vendor-checked table is the correctness measure, because it compares each side with an independently
  checked date instead of with the other side.
* **Coverage** counts products and families, not repositories. endoflife.date is broader across products; Evergreen
  covers API, package, and platform families that endoflife.date does not model.

## Reproduce

```bash
npm ci
npm run build
node dist/benchmarks/comparison/compare-endoflife-date.js          # rewrite the JSON and Markdown
node dist/benchmarks/comparison/compare-endoflife-date.js --check  # exit 1 when either committed file is stale
```

The command reads only committed files: no network, no repository code, no clock. `npm run check` builds and tests
it. Refreshing the snapshot is a separate maintainer action with network access:

```bash
curl https://endoflife.date/api/all.json
curl https://endoflife.date/api/<product>.json
```

Then update `retrievedAt` in the snapshot and rerun the command. A snapshot refresh is a data-only change; if it
changes a published number, say so in the pull request.

## Limits

* The snapshot is one day's view. A later endoflife.date edit does not change these results until the snapshot is
  refreshed.
* Products endoflife.date publishes but Evergreen does not model are listed as endoflife.date-only; the comparison
  does not claim Evergreen should cover them.
* A date agreement is not proof of a vendor claim. The correctness table is limited to the records whose corpus
  note names a lifecycle date; the rest of the corpus verifies the finding, not the date.
* Framework release lines (Next.js, Rails, Django, Angular, Vue, Laravel, Spring Boot) are left out even where
  endoflife.date publishes a cycle. Their support policies do not use Evergreen's event vocabulary consistently,
  so comparing them is a separate measure, not a silent omission: they appear under the `package-level` reason.
