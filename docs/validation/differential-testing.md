---
title: Differential testing
---

# Differential testing

How Evergreen's findings compare with Renovate, xeol, and Pluto, and what each disagreement means. The summary and the accuracy table are on [Validation](../VALIDATION.md).

## Differential testing against Renovate

Renovate is the closest widely used tool, so the report compares Evergreen's findings with Renovate's for the same repository, by rule family. A maintainer runs Renovate (it needs the network and a large download; it is not part of `npm run check` or any scan). Give it a read-only GitHub token, or it cannot look up GitHub Actions:

```bash
export RENOVATE_TOKEN=<token> GITHUB_COM_TOKEN=<token>
npx renovate --platform=local --dry-run=lookup --report-type=file --report-path=renovate.json
npm run differential:renovate -- --renovate renovate.json --repository . --name owner/repo --out report.json
```

The two tools answer different questions. Renovate says a newer version exists and prints npm deprecation notices; it has no end-of-life data. Evergreen says a release line is past its vendor's end of life; it does not say an update exists. So the report only compares where both can speak about one dependency in one file:

| Family | Evergreen | Renovate | Counted as agreement |
| --- | --- | --- | --- |
| `deprecated-package` | `npm.package.*` findings | npm `deprecationMessage` | both mark the package deprecated |
| `base-image` | `container.*` findings | `dockerfile` / `docker-compose` updates | Renovate offers an update for the image Evergreen calls end-of-life |
| `github-action` | `github-actions.*` findings | `github-actions` updates | Renovate offers an update for the action Evergreen flags |

Outcomes: `agree`, `evergreen-only`, `renovate-only`, and `inconclusive` (Renovate skipped the lookup, for example `github-token-required` for Actions when run without a GitHub token, so it says nothing either way). Runtime findings (`nodejs.runtime.*`, `python.runtime.*`) have no Renovate counterpart and are listed as not comparable. Matching is by file and dependency name because Renovate gives no line numbers.

The committed reports are combined into one reviewable page, [differential-report.md](../differential-report.md) (and [differential-report.json](../differential-report.json)), which lists every disagreement with links to the declaration at the pinned commit and to each tool's evidence. Regenerate it with `npm run differential:report` after adding or refreshing a report; a test fails when it drifts from the reports.

Results for the five container corpus repositories, with Renovate 44.164 run with a read-only GitHub token on 2026-10-23 (reports in [`benchmarks/differential/reports/`](../../benchmarks/differential/reports/), trimmed Renovate output in `tests/fixtures/differential/`):

| Repository | Agree | Evergreen-only | Renovate-only | Inconclusive |
| --- | --- | --- | --- | --- |
| outline/outline | 22 | 5 | 13 | 0 |
| excalidraw/excalidraw | 23 | 2 | 2 | 0 |
| mealie-recipes/mealie | 17 | 0 | 4 | 0 |
| umami-software/umami | 8 | 1 | 0 | 0 |
| gethomepage/homepage | 0 | 0 | 0 | 0 |

What it shows:

- **Agreements** are 10 base images, 53 GitHub Action findings, and 7 npm deprecations. Where Evergreen calls `node` or `postgres` end-of-life, or flags `actions/checkout` on Node 20, Renovate offers a newer major version. Renovate does not say the old line is unsupported; only Evergreen does.
- **No comparison is inconclusive.** With a token Renovate looks up every GitHub Action, so the Action findings that were `inconclusive` in the 2026-10-16 run are now comparisons, and all of them agree.
- **Renovate-only** are npm deprecations Evergreen has no rule for (for example `@types/diff`, `@types/glob`, `@nuxt/types`, `react-waypoint`). This is the real gap: the `npm-deprecated` importer only checks a candidate list, so these names are candidates to add. Each is a Renovate observation, not evidence; the importer still requires the registry's own deprecation notice.
- **Evergreen-only** is not a real disagreement yet. All eight entries are packages Renovate does list, under a different spelling: the comparison reads the package name from the rule id, so `@types/dotenv` becomes `types.dotenv` and `next` with a version-line rule becomes `next.14`. Six of the Renovate-only `@types/*` entries are the same packages seen from the other side. Matching by the rule's package name is a follow-up to this comparison.

## Differential testing against xeol

[xeol](https://github.com/xeol-io/xeol) reports release cycles of products (runtimes, databases, npm packages) that endoflife.date lists as past end of life, for versions it finds in lockfiles and image filesystems. A maintainer runs it (it downloads an EOL database; it is not part of `npm run check` or any scan):

```bash
xeol dir:<checkout> -o json > xeol.json
npm run differential:xeol -- --xeol xeol.json --repository <checkout> --name owner/repo --out report.json
```

The report compares by product, not by file: xeol names the lockfile that resolved a version, Evergreen names the manifest that declares it. Evergreen runtime, container image, and npm package findings are compared with the xeol product of the same name (`node` images with `nodejs`, `golang` with `go`, `postgres` with `postgresql`). Outcomes: `agree` (both report the product), `evergreen-only`, and `xeol-only`. GitHub Actions, CI images, and the other families xeol has no product for are listed as not comparable.

Results for the five repositories of the Renovate comparison, with xeol 0.10.8 run with `dir:` on the pinned checkouts on 2026-10-23 (reports in [`benchmarks/differential/reports/xeol/`](../../benchmarks/differential/reports/xeol/), trimmed xeol output in `tests/fixtures/xeol/`):

| Repository | Agree | Evergreen-only | xeol-only |
| --- | --- | --- | --- |
| excalidraw/excalidraw | 0 | 3 | 0 |
| gethomepage/homepage | 0 | 0 | 0 |
| mealie-recipes/mealie | 0 | 2 | 2 |
| outline/outline | 0 | 11 | 0 |
| umami-software/umami | 1 | 4 | 1 |

What the numbers say:

- **Agreement is rare because the tools read different files.** `xeol dir:` resolves versions from lockfiles; it does not read Dockerfiles, workflow files, `.nvmrc`, or `engines`. Every Evergreen runtime and image finding here is therefore Evergreen-only, and not a sign that xeol disagrees. Where both read the same dependency, they agree: both call `next` 13 end of life in umami.
- **xeol-only** are npm packages whose release line endoflife.date lists as ended (`vue` 2.6 and 3.2, `vuetify` 2). Evergreen has no rule for them; each is a candidate for the `npm-support-end` importer, not evidence by itself.
- **Not compared:** GitHub Actions findings, which are the largest Evergreen family in these repositories and which xeol does not model.
## Differential testing against Pluto

[Pluto](https://github.com/FairwindsOps/pluto) reads `apiVersion` and `kind` from manifests and says whether the Kubernetes project still serves them, which is the question the `kubernetes` detector answers. A maintainer runs it (it is not part of `npm run check` or any scan). Run it from inside the checkout, because Pluto joins `--directory` to the working directory:

```bash
(cd <checkout> && pluto detect-files -d . -o json -t k8s=v1.36.0 > pluto.json)
npm run differential:pluto -- --pluto pluto.json --repository <checkout> --name owner/repo --out report.json
```

Findings are compared by file, kind, API group, and version. Outcomes: `agree` (Pluto reports the version as removed at the target version), `evergreen-only`, `pluto-only`, and `pluto-deprecated-only` (deprecated but still served; Evergreen judges only removed versions, so this is not a disagreement). Non-Kubernetes findings are listed as not comparable.

Results for the seventeen Kubernetes corpus repositories, with Pluto 5.24.4 at target `k8s=v1.36.0` on the pinned checkouts on 2026-10-23 (reports in [`benchmarks/differential/reports/pluto/`](../../benchmarks/differential/reports/pluto/), trimmed Pluto output in `tests/fixtures/pluto/`; repositories with no Kubernetes finding from either tool are left out of the table):

| Repository | Agree | Evergreen-only | Pluto-only | Pluto deprecated-only |
| --- | --- | --- | --- | --- |
| FairwindsOps/pluto | 1 | 1 | 3 | 0 |
| doitintl/kube-no-trouble | 0 | 0 | 38 | 1 |
| hasura/skor | 0 | 0 | 1 | 0 |
| kelseyhightower/ingress-with-static-ip | 1 | 0 | 0 | 0 |
| kelseyhightower/kubernetes-cluster-federation | 5 | 0 | 0 | 0 |
| knrt10/kubernetes-basicLearning | 1 | 0 | 0 | 0 |
| kubernetes/examples | 10 | 0 | 0 | 0 |
| luksa/kubernetes-in-action | 27 | 0 | 0 | 0 |
| lusyoe/springboot-k8s-example | 1 | 1 | 0 | 0 |
| motiv-labs/janus | 0 | 2 | 0 | 0 |
| ossf/package-analysis | 1 | 0 | 0 | 0 |
| unixhot/salt-kubebin | 15 | 0 | 0 | 0 |
| **Total** | **62** | **4** | **42** | **1** |

Every difference has one of three causes, none of them a wrong finding:

- **Evergreen-only** are Helm templates (`charts/templates/ingress.yaml`, `janus/templates/*.yaml`, a test chart). Pluto cannot parse files with template actions and skips them; Evergreen reads the `apiVersion` and `kind` lines of a template. This is Evergreen finding more.
- **Pluto-only** are `kind: List` items (`hasura/skor`, one Pluto test asset), JSON manifests, and files under `fixtures/` and `testdata/` directories (`doitintl/kube-no-trouble` has 38, `FairwindsOps/pluto` three). The detector page lists these as not judged. Pluto finding more here is the known cost of Evergreen's conservative scope, and the same forms are why the blind repositories were rechecked by hand.
- **Disagreement on a version Evergreen does judge** is zero: all 62 manifests that both tools read agree on removed.
