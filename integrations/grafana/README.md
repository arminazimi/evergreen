# Grafana

Requires Grafana 10 or newer and the [Infinity data source](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/) plugin. Infinity 4.x itself needs Grafana 11.6.11 or newer (11.6.x, 12.0.x, 12.1.x, or 12.2.5+); on an older Grafana, install an Infinity release that supports it.

[`evergreen-lifecycle.json`](evergreen-lifecycle.json) is a dashboard that reads the developer-portal export (`evergreen export --format portal`, schema [`evergreen.portal.v1`](../../schemas/portal.v1.schema.json)) through Infinity. It shows every team the lifecycle risk of every scanned service in the Grafana they already have open:

- **Findings by severity** — total open findings per severity across all services in the export.
- **Findings by severity over time** — the same findings on the end-of-life timeline, one stacked bar per deadline.
- **Next end-of-life dates** — the next deadline per service, soonest first, with a link to that service's detailed Evergreen report.
- **Services by severity** — counts per service, worst first, so an owner can see their own row.

Evergreen still scans locally and adds no network access. The dashboard only reads the JSON file your CI already writes.

## 1. Install the Infinity plugin

On a self-hosted Grafana:

```bash
grafana-cli plugins install yesoreyeram-infinity-datasource
# then restart Grafana
```

In Docker, install it with `GF_INSTALL_PLUGINS=yesoreyeram-infinity-datasource`. On Grafana Cloud, install Infinity from the plugin catalog.

Create an Infinity data source and leave the URL empty; each panel in this dashboard supplies its own URL. If your export is served behind authentication, set the header or basic-auth credentials on the data source instead of in the dashboard.

## 2. Write the export in CI

`evergreen export --format portal` scans each path and prints one catalog for all of them. It reads the bundled lifecycle data, so the step needs no network beyond fetching the package with `npx`. Pin the package version in CI for reproducibility; `export --format portal` first ships in a release after 0.7.1, so use that version or newer:

```bash
npx --yes evergreen-deprecation export --format portal . > evergreen-portal.json
```

For a monorepo, pass one path per service and make the report links point at your artifact host:

```bash
npx --yes evergreen-deprecation export --format portal \
  services/api services/web services/payments \
  --report-base-url "https://ci.example.com/artifacts/evergreen" \
  > evergreen-portal.json
```

GitHub Actions example:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx --yes evergreen-deprecation@<version> export --format portal . > evergreen-portal.json
- uses: actions/upload-artifact@v4
  with:
    name: evergreen-portal
    path: evergreen-portal.json
```

Publish the file where Grafana can fetch it: a static bucket, a Pages site, an internal object store, or an artifact proxy. Artifact URLs that require a GitHub login cannot be read by Grafana directly; put the file behind a URL the data source can reach, or add its token as a header on the Infinity data source.

## 3. Import the dashboard

1. In Grafana, go to **Dashboards → New → Import** and upload [`evergreen-lifecycle.json`](evergreen-lifecycle.json).
2. Pick your Infinity data source for **Infinity datasource**.
3. Set **Portal export URL** to the published `evergreen-portal.json` URL and save.

With no configuration the dashboard reads [`sample-data/portal-export.json`](sample-data/portal-export.json), a nine-service catalog that conforms to `schemas/portal.v1.schema.json`, so it renders as soon as it is imported. Grafana fetches that URL through the Infinity data source, so the Grafana server needs outbound access to GitHub; point the variable at a local file URL if it does not. The variable is visible at the top of the dashboard; point it at your own export when you are ready.

Every scan run that republishes the export updates the dashboard on its next refresh. Keep the previous file if you want to compare runs: change **Portal export URL** to the older artifact.

## Panel notes

- The export is one point-in-time snapshot and carries no run timestamp. **Findings by severity over time** therefore plots each service at its next end-of-life date — the only date in the export — and shows how much risk lands on each deadline. Save one export per run to compare runs over time.
- **Next end-of-life dates** leaves out services whose findings have no dated deadline; the catalog schema keeps `nextEndOfLife` optional for exactly those services. The tables show it as the ISO date the export writes; the time-series panel reads the same field as a timestamp.
- Dates are calendar days from the registry and are displayed in UTC. The dashboard defaults to the range `now-6M` to `now+3y` so upcoming deadlines are visible; widen it to see older ones.
- Report links come from `reportLink` in the export, so they stay correct only if `--report-base-url` points at the location where you publish reports.
- The queries use Infinity's simple (frontend) parser, a JSON root selector of `services`, and columns for `path`, `nextEndOfLife`, `severities.*`, and `reportLink`. Nothing else in the export is read. Alerting on these panels would need the backend parser; this dashboard is for viewing.

## Files

| File | Purpose |
|---|---|
| [`evergreen-lifecycle.json`](evergreen-lifecycle.json) | The importable dashboard. |
| [`sample-data/portal-export.json`](sample-data/portal-export.json) | Sample `evergreen.portal.v1` catalog the dashboard reads by default. |

## Verification status

Checked (2026-10-30): imported into Grafana 12.2.5 with Infinity 4.1.4 and rendered against `sample-data/portal-export.json`. All four panels showed data: severity totals `info 5, low 6, medium 11, high 8, critical 4` matched the export; the next end-of-life table listed the eight dated services soonest first with working report links and left out the service with no deadline; the services table listed all nine; the browser console reported no errors. The dashboard and sample data are valid JSON, the sample conforms to `schemas/portal.v1.schema.json`, and every Infinity column points at a field that exists in that sample.

Not checked: hosts other than the versions above. Infinity 4.x requires Grafana 11.6.11 or newer; on Grafana 11.4.0 its frontend failed to load (`react/jsx-runtime` 404), so older installations need an Infinity release that matches their Grafana.
