{% raw %}
# Developer portals

Platform teams that already run Backstage, Grafana, Port, or Cortex can show Evergreen lifecycle risk next to the rest of their service catalog. Every path starts from the same offline export; only the step that publishes or pushes the catalog talks to the network. Scans themselves never leave the machine.

| Portal | What you get | Details |
| --- | --- | --- |
| [Backstage](#backstage) | Lifecycle card on each Component page | [`integrations/backstage/`](../integrations/backstage/) |
| [Grafana](#grafana) | Dashboard of severity totals, deadlines, and per-service counts | [`integrations/grafana/`](../integrations/grafana/) |
| [Port](#port) | `evergreen-service` blueprint entities with findings and next end-of-life | [`integrations/port/`](../integrations/port/) |
| [Cortex](#cortex) | `evergreen-lifecycle` custom data on each entity | [`integrations/cortex/`](../integrations/cortex/) |

The catalog schema is [`evergreen.portal.v1`](../schemas/portal.v1.schema.json). For organization-wide scanning before you wire a portal, see [Organization rollout](ORG_ROLLOUT.md).

## Export the catalog

`evergreen export --format portal` scans each path and prints one catalog for all of them. It reads bundled lifecycle data, so the step needs no network beyond fetching the package with `npx`. Pin the package version in CI; `export --format portal` first ships in a release after 0.7.1, so use that version or newer.

```bash
npx --yes evergreen-deprecation@<version> export --format portal \
  services/api services/web services/payments \
  --report-base-url "https://ci.example.com/artifacts/evergreen" \
  > evergreen-portal.json
```

One path per service keeps identifiers and titles readable. `--report-base-url` makes each `reportLink` an absolute URL to the detailed Evergreen report your CI publishes.

GitHub Actions example that writes and uploads the file:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx --yes evergreen-deprecation@<version> export --format portal services/api services/web services/payments --report-base-url "https://ci.example.com/artifacts/evergreen" > evergreen-portal.json
- uses: actions/upload-artifact@v4
  with:
    name: evergreen-portal
    path: evergreen-portal.json
```

Publish the file where the portal can read it: a mounted volume, a static bucket, a Pages site, or an internal URL. Artifact URLs that require a personal GitHub login cannot be fetched by Backstage or Grafana; put the file behind a URL or volume those systems can reach.

## Backstage

The Backstage plugin reads the published export and shows finding counts, the next end-of-life date, and a report link on each Component page. It never scans a repository.

### Annotate Components

Set `evergreen.io/service-path` to the scanned path that appears in the export:

```yaml
metadata:
  annotations:
    evergreen.io/service-path: /repos/api
```

### Install the plugin

Copy or path-link the packages from [`integrations/backstage/`](../integrations/backstage/) into your Backstage workspace (they are not on npm yet):

**Backend** (`packages/backend/src/index.ts`):

```ts
backend.add(import('@evergreen-deprecation/backstage-plugin-backend'));
```

**App config** (`app-config.yaml`):

```yaml
evergreen:
  portalExportSource: /var/evergreen/evergreen-portal.json
  # or an https:// URL the backend can fetch
```

**Frontend** — register the card on Component entity pages:

```tsx
import { EntityEvergreenLifecycleCard } from '@evergreen-deprecation/backstage-plugin';

// Inside EntityLayout for kind Component:
<EntityLayout.Route path="/" title="Overview">
  <Grid container spacing={3}>
    {/* …existing cards… */}
    <Grid item md={6} xs={12}>
      <EntityEvergreenLifecycleCard />
    </Grid>
  </Grid>
</EntityLayout.Route>
```

To try the cards without a Backstage install, from this repository:

```bash
node integrations/backstage/sample-app/verify.mjs
node integrations/backstage/sample-app/serve.mjs
# open http://127.0.0.1:4173/
```

## Grafana

Requires Grafana 10 or newer and the [Infinity data source](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/) plugin. Infinity 4.x needs Grafana 11.6.11 or newer.

### Install Infinity

```bash
grafana-cli plugins install yesoreyeram-infinity-datasource
# then restart Grafana
```

On Grafana Cloud, install Infinity from the plugin catalog. Create an Infinity data source and leave the URL empty; each panel supplies its own URL.

### Import the dashboard

1. In Grafana, go to **Dashboards → New → Import** and upload [`integrations/grafana/evergreen-lifecycle.json`](../integrations/grafana/evergreen-lifecycle.json).
2. Pick your Infinity data source for **Infinity datasource**.
3. Set **Portal export URL** to the published `evergreen-portal.json` URL and save.

With no configuration the dashboard reads the sample catalog under [`integrations/grafana/sample-data/`](../integrations/grafana/sample-data/), so it renders as soon as it is imported. Point **Portal export URL** at your own export when you are ready. Every scan run that republishes the export updates the dashboard on its next refresh.

## Port

[`integrations/port/map.mjs`](../integrations/port/map.mjs) turns the export into a bulk entity upsert for the [`evergreen-service`](../integrations/port/blueprint.json) blueprint.

### Create the blueprint (once)

Import [`integrations/port/blueprint.json`](../integrations/port/blueprint.json) in Port (**Builder → Blueprints → Import**) or create it with the API:

```bash
curl -sS -X POST "https://api.us.port.io/v1/blueprints" \
  -H "Authorization: Bearer $PORT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @integrations/port/blueprint.json
```

Use `https://api.port.io` for the Europe region.

### Map and push in CI

Create a client ID and client secret in Port and store them as `PORT_CLIENT_ID` and `PORT_CLIENT_SECRET`.

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

`upsert=true` creates missing entities and updates existing ones; `merge=true` updates only the properties in this payload. Try the mapping locally:

```bash
node integrations/port/map.mjs integrations/port/sample-data/portal-export.json
```

## Cortex

[`integrations/cortex/map.mjs`](../integrations/cortex/map.mjs) turns the export into a bulk custom-data push. Each scanned path becomes one entry under its entity tag (the last path segment), with values under the key `evergreen-lifecycle`. Custom data attaches to entities that already exist; it does not create them. Make sure each service's `x-cortex-tag` matches the directory name you scan.

### Map and push in CI

Create an API key with **Edit entities** and store it as `CORTEX_API_TOKEN`.

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

Use `https://api.eu.cortex.io` for the EU region. Try the mapping locally:

```bash
node integrations/cortex/map.mjs integrations/cortex/sample-data/portal-export.json
```

## Privacy and network

| Step | Network |
| --- | --- |
| `evergreen export --format portal` | None beyond fetching the package. Detectors read repository files and bundled data only. |
| Publish the JSON file | Your artifact host, bucket, or Pages site |
| Backstage / Grafana read | The backend or Infinity data source fetches the published file |
| Port / Cortex push | CI calls the Port or Cortex API with the mapped payload |

Evergreen does not send repository contents to an Evergreen service. The export carries repository-relative paths, severity counts, optional deadlines, and report links — apply the same access controls you use for scan report artifacts.
{% endraw %}
