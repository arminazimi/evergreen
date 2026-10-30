# Port

[Port](https://www.port.io/) catalogs services in blueprints. [`map.mjs`](map.mjs) turns the developer-portal export (`evergreen export --format portal`, schema [`evergreen.portal.v1`](../../schemas/portal.v1.schema.json)) into the body of a bulk entity upsert for the [`evergreen-service`](blueprint.json) blueprint, so every service carries its lifecycle risk next to the rest of its catalog data.

Each scanned path becomes one entity:

| Export field | Entity |
|---|---|
| `services[].path` | `properties.path`, and the entity identifier (`/repos/api` → `repos-api`) |
| `services[].severities.*` | `properties.findings_info`, `findings_low`, `findings_medium`, `findings_high`, `findings_critical` |
| (sum of `severities`) | `properties.findings_total` |
| `services[].nextEndOfLife` | `properties.next_end_of_life`; omitted when no finding has a deadline |
| `services[].reportLink` | `properties.report_link` |

Evergreen still scans locally and adds no network access. The mapping is plain Node: it reads the export from disk and prints JSON. Only the CI step that calls the Port API talks to the network.

## 1. Write the export in CI

`evergreen export --format portal` scans each path and prints one catalog for all of them. It reads bundled lifecycle data, so the step needs no network beyond fetching the package with `npx`. Pin the package version in CI for reproducibility; `export --format portal` first ships in a release after 0.7.1, so use that version or newer:

```bash
npx --yes evergreen-deprecation@<version> export --format portal \
  services/api services/web services/payments \
  --report-base-url "https://ci.example.com/artifacts/evergreen" \
  > evergreen-portal.json
```

One path per service keeps the identifier and the title readable. `--report-base-url` makes `report_link` an absolute URL to the detailed Evergreen report your CI publishes.

## 2. Create the blueprint (once)

Import [`blueprint.json`](blueprint.json) in Port (**Builder → Blueprints → Import**) or create it with the API:

```bash
curl -sS -X POST "https://api.us.port.io/v1/blueprints" \
  -H "Authorization: Bearer $PORT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @integrations/port/blueprint.json
```

Use the API host of your region: `https://api.us.port.io` (United States) or `https://api.port.io` (Europe).

## 3. Create a Port credential

Create a client ID and client secret (**Credentials**, from the `…` menu in the top-right corner) and store them as `PORT_CLIENT_ID` and `PORT_CLIENT_SECRET` in your CI secrets. Each run exchanges them for a short-lived token; Port tokens are valid for three hours.

## 4. Map and push in CI

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx --yes evergreen-deprecation@<version> export --format portal services/api services/web > evergreen-portal.json
- run: node integrations/port/map.mjs evergreen-portal.json > port-entities.json
- run: |
    TOKEN=$(curl -sS -X POST "https://api.us.port.io/v1/auth/access_token" \
      -H "Content-Type: application/json" \
      -d "{\"clientId\":\"$PORT_CLIENT_ID\",\"clientSecret\":\"$PORT_CLIENT_SECRET\"}" | jq -r .accessToken)
    curl -sS -X POST "https://api.us.port.io/v1/blueprints/evergreen-service/entities/bulk?upsert=true&merge=true" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      --data @port-entities.json
  env:
    PORT_CLIENT_ID: ${{ secrets.PORT_CLIENT_ID }}
    PORT_CLIENT_SECRET: ${{ secrets.PORT_CLIENT_SECRET }}
```

`upsert=true` creates missing entities and updates existing ones; `merge=true` updates only the properties in this payload, so fields you maintain by hand on the entity survive. Drop `merge` if you want each run to replace the whole entity.

Run the mapping locally against the sample catalog to see the payload:

```bash
node integrations/port/map.mjs integrations/port/sample-data/portal-export.json
```

## Identifier rules

- The identifier is the scanned path, lowercased, with every run of characters that are not letters or digits replaced by a hyphen: `/repos/api` → `repos-api`, `C:\repos\api` → `repos-api`, `./services/api` → `services-api`.
- Two paths that produce the same identifier are an error, not a silent overwrite. Scan services under distinct directory names.
- The entity title is the last path segment (`api`).
- Forks and absolute paths leak into the identifier (`/Users/ada/src/api` → `users-ada-src-api`). Scan from the repository root with relative service paths so identifiers stay stable across machines.

## Files

| File | Purpose |
|---|---|
| [`map.mjs`](map.mjs) | Maps the export to the bulk entity upsert body; prints it to stdout. Unit-tested in [`tests/port-integration.test.ts`](../../tests/port-integration.test.ts). |
| [`blueprint.json`](blueprint.json) | The `evergreen-service` blueprint the mapping writes to. |
| [`sample-data/portal-export.json`](sample-data/portal-export.json) | A nine-service catalog that conforms to `schemas/portal.v1.schema.json`, for trying the mapping locally. |

The mapping payload is covered by tests against the sample catalog. It has not been pushed to a live Port organization from this repository, so verify your region's API host and credentials on the first run.
