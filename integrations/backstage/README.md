# Backstage

Shows lifecycle risk for every Component in the Backstage catalog your platform team already runs. The plugin reads the developer-portal export (`evergreen export --format portal`, schema [`evergreen.portal.v1`](../../schemas/portal.v1.schema.json)) from a CI artifact path or a URL. It never scans a repository and adds no network access to Evergreen scans.

- **Backend module** — serves the published catalog at `/api/evergreen/catalog` and a per-path lookup at `/api/evergreen/services?path=…`.
- **Frontend card** — `EntityEvergreenLifecycleCard` on a Component page: finding counts by severity, the next end-of-life date, and a link to that service's detailed Evergreen report.
- **Sample app** — [`sample-app/`](sample-app/) renders the same cards from [`sample-data/portal-export.json`](sample-data/portal-export.json) without installing Backstage.

## 1. Write the export in CI

```bash
npx --yes evergreen-deprecation@<version> export --format portal \
  services/api services/web services/payments \
  --report-base-url "https://ci.example.com/artifacts/evergreen" \
  > evergreen-portal.json
```

Publish the file where the Backstage backend can read it: a path mounted into the backend container, a static bucket, or an internal URL. Artifact URLs that require a personal GitHub login cannot be fetched by the backend; put the file behind a URL or volume the backend can reach.

## 2. Annotate catalog Components

Set `evergreen.io/service-path` to the scanned path that appears in the export (the `path` field):

```yaml
metadata:
  annotations:
    evergreen.io/service-path: /repos/api
```

The backend matches exact paths first (trailing slashes ignored), then a unique basename.

## 3. Install the plugin into a Backstage app

Copy or path-link the packages from this directory into your Backstage workspace (they are not published to npm yet; directory listing is a follow-up):

| Package | Path |
|---|---|
| `@evergreen-deprecation/backstage-plugin` | [`plugin/`](plugin/) |
| `@evergreen-deprecation/backstage-plugin-backend` | [`plugin-backend/`](plugin-backend/) |

Shared types live in [`common/`](common/) and are imported by both packages.

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

**Frontend** — register the card on Component entity pages (classic entity page):

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

Peer dependencies are the Backstage packages your app already has (`@backstage/backend-plugin-api`, `@backstage/core-plugin-api`, `@backstage/plugin-catalog-react`, Material UI 4, React 17 or 18). No dependency is added to the Evergreen npm package itself.

## 4. Sample app (no Backstage install)

From the Evergreen repository root:

```bash
node integrations/backstage/sample-app/verify.mjs
node integrations/backstage/sample-app/serve.mjs
# open http://127.0.0.1:4173/
```

`verify.mjs` checks the sample export against `schemas/portal.v1.schema.json`, matches every sample Component, and writes [`sample-app/out/preview.html`](sample-app/out/preview.html). `serve.mjs` serves those cards and the same `/api/evergreen/*` routes the backend plugin exposes.

Sample Components are in [`sample-app/catalog/entities.yaml`](sample-app/catalog/entities.yaml). To wire them into a full Backstage instance, point `catalog.locations` at that file and set `evergreen.portalExportSource` as in [`sample-app/app-config.yaml`](sample-app/app-config.yaml).

## Files

| Path | Purpose |
|---|---|
| [`plugin/`](plugin/) | Frontend plugin and `EntityEvergreenLifecycleCard`. |
| [`plugin-backend/`](plugin-backend/) | Backend module that loads the portal export. |
| [`common/`](common/) | Shared portal parse/match helpers. |
| [`sample-data/portal-export.json`](sample-data/portal-export.json) | Nine-service `evergreen.portal.v1` catalog (same fixture as the Grafana dashboard). |
| [`sample-app/`](sample-app/) | Catalog entities, app-config snippet, and zero-dep renderer. |

## Verification status

Checked (2026-10-30):

- `npm ci` and `npm run check` — pass (root package unchanged; this integration is not part of the published tarball).
- `node integrations/backstage/sample-app/verify.mjs` — sample export validates against `schemas/portal.v1.schema.json`; four sample Components resolve to portal rows; `out/preview.html` contains cards for `api`, `legacy-batch`, `checkout`, and `payments` with severity counts and report links.
- `node integrations/backstage/sample-app/serve.mjs` — page at `http://127.0.0.1:4173/` rendered the four cards; `/api/evergreen/catalog` returned nine services; `/api/evergreen/services?path=/repos/api` returned the api row with `nextEndOfLife=2026-12-31`.
- Severity totals across the sample export: `info 5, low 6, medium 11, high 8, critical 4` (same fixture as Grafana).

Not checked: installing the TypeScript packages into a full `npx @backstage/create-app` workspace (peer APIs match Backstage 1.26+ new backend system and classic entity pages; confirm against your app's Backstage version before production). Directory listing is #1651.

Evergreen scans still make no network calls. The Backstage backend only reads the published export you configure.
