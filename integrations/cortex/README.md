# Cortex

[Cortex](https://www.cortex.io/) scores services from the metadata on its entities. [`map.mjs`](map.mjs) turns the developer-portal export (`evergreen export --format portal`, schema [`evergreen.portal.v1`](../../schemas/portal.v1.schema.json)) into the body of a bulk custom-data push, so every service entity carries its lifecycle risk as custom data.

Each scanned path becomes one entry under its entity tag:

| Export field | Custom data |
|---|---|
| `services[].path` | tag: the last path segment (`/repos/api` → `api`); value: `path` |
| `services[].severities.*` | value: `severities` |
| `services[].nextEndOfLife` | value: `nextEndOfLife`; omitted when no finding has a deadline |
| `services[].reportLink` | value: `reportLink` |

All values live under one custom-data key, `evergreen-lifecycle`, whose value is the JSON object:

```json
{
  "path": "/repos/api",
  "severities": { "info": 1, "low": 0, "medium": 2, "high": 1, "critical": 1 },
  "nextEndOfLife": "2026-12-31",
  "reportLink": "https://ci.example.com/artifacts/evergreen-report-api.json"
}
```

One key means each run replaces the previous snapshot, and a Scorecard rule can read a field of the object or process it with `jq`.

Evergreen still scans locally and adds no network access. The mapping is plain Node: it reads the export from disk and prints JSON. Only the CI step that calls the Cortex API talks to the network.

## 1. Write the export in CI

`evergreen export --format portal` scans each path and prints one catalog for all of them. It reads bundled lifecycle data, so the step needs no network beyond fetching the package with `npx`. Pin the package version in CI for reproducibility; `export --format portal` first ships in a release after 0.7.1, so use that version or newer:

```bash
npx --yes evergreen-deprecation@<version> export --format portal \
  services/api services/web services/payments \
  --report-base-url "https://ci.example.com/artifacts/evergreen" \
  > evergreen-portal.json
```

The tag is the last path segment, lowercased, with every run of characters that are not letters or digits replaced by a hyphen, so scan each service under the directory name that matches its `x-cortex-tag`. Two paths with the same last segment (`apps/api` and `services/api`) are an error, not a silent overwrite.

## 2. Check the tags exist

Custom data attaches to an entity that already exists in Cortex; it does not create entities. Make sure the catalog already contains an entity whose `x-cortex-tag` is the service name you scan (`api`, `payments`, …). A tag with no entity is reported in the `errors` object of the API response.

## 3. Map and push in CI

Create an API key with the **Edit entities** permission (**Settings → API keys**) and store it as `CORTEX_API_TOKEN`.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx --yes evergreen-deprecation@<version> export --format portal services/api services/web > evergreen-portal.json
- run: node integrations/cortex/map.mjs evergreen-portal.json > cortex-custom-data.json
- run: |
    curl -sS -X PUT "https://api.getcortexapp.com/api/v1/catalog/custom-data" \
      -H "Authorization: Bearer $CORTEX_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data @cortex-custom-data.json
  env:
    CORTEX_API_TOKEN: ${{ secrets.CORTEX_API_TOKEN }}
```

Use `https://api.eu.cortex.io` instead of `https://api.getcortexapp.com` for the EU region.

Run the mapping locally against the sample catalog to see the payload:

```bash
node integrations/cortex/map.mjs integrations/cortex/sample-data/portal-export.json
```

## Notes

- Custom data defined in the entity descriptor (YAML) is not overwritten by the API unless you add `?force=true`. If `evergreen-lifecycle` is already in a descriptor, keep it there as the source of truth or remove it and let CI own the key.
- Custom data added this way is tagged **API** in Cortex and shows the time it was last updated, so a stale push is visible on the entity page.
- Report links come from `reportLink`, so they stay correct only if `--report-base-url` points at the location where you publish reports.

## Files

| File | Purpose |
|---|---|
| [`map.mjs`](map.mjs) | Maps the export to the bulk custom-data body; prints it to stdout. Unit-tested in [`tests/cortex-integration.test.ts`](../../tests/cortex-integration.test.ts). |
| [`sample-data/portal-export.json`](sample-data/portal-export.json) | A nine-service catalog that conforms to `schemas/portal.v1.schema.json`, for trying the mapping locally. |

The mapping payload is covered by tests against the sample catalog. It has not been pushed to a live Cortex workspace from this repository, so verify your workspace's API host and permissions on the first run.
