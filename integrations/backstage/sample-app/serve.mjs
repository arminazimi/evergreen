#!/usr/bin/env node
/**
 * Zero-dependency sample that loads the portal export and renders one lifecycle-risk
 * card per sample catalog Component — the same data the Backstage plugin card shows.
 *
 *   node integrations/backstage/sample-app/serve.mjs
 *   open http://127.0.0.1:4173/
 *
 * Also writes sample-app/out/preview.html so the cards can be inspected without a server.
 */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPortalCatalog } from "../common/load-portal.mjs";
import {
  SERVICE_PATH_ANNOTATION,
  SEVERITIES,
  findService,
  highestSeverity,
  totalFindings,
} from "../common/portal.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const portalPath = resolve(root, "sample-data/portal-export.json");
const entitiesPath = resolve(here, "catalog/entities.yaml");
const outDir = resolve(here, "out");
const port = Number(process.env.PORT ?? 4173);

/**
 * Minimal parser for the flat sample Component YAML in catalog/entities.yaml.
 * @param {string} text
 */
function parseSampleEntities(text) {
  const docs = text
    .split(/^---\s*$/m)
    .map((d) => d.trim())
    .filter((d) => /\bkind:\s*Component\b/.test(d));

  return docs.map((doc) => {
    const name = matchMetadataField(doc, "name");
    if (!name) {
      throw new Error(`sample catalog Component is missing metadata.name:\n${doc.slice(0, 200)}`);
    }
    const description = matchMetadataField(doc, "description") ?? "";
    /** @type {Record<string, string>} */
    const annotations = {};
    const path = doc.match(/evergreen\.io\/service-path:\s*(\S+)/);
    if (path) annotations[SERVICE_PATH_ANNOTATION] = path[1];
    return { name, description, annotations };
  });
}

/**
 * @param {string} doc
 * @param {string} field
 */
function matchMetadataField(doc, field) {
  const metadata = doc.match(/metadata:\n([\s\S]*?)(?:\nspec:|\s*$)/);
  if (!metadata) return undefined;
  const m = metadata[1].match(new RegExp(`(?:^|\\n)\\s*${field}:\\s*(.+)\\s*(?=\\n|$)`));
  return m ? m[1].trim() : undefined;
}

/**
 * @param {string} value
 */
/**
 * @param {unknown} value
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * @param {{ name: string, description: string, annotations: Record<string, string> }} entity
 * @param {import('../common/portal.mjs').PortalService | undefined} service
 */
function renderCard(entity, service) {
  const path = entity.annotations[SERVICE_PATH_ANNOTATION];
  if (!path) {
    return `<article class="card missing"><h2>${escapeHtml(entity.name)}</h2><p>Missing ${escapeHtml(SERVICE_PATH_ANNOTATION)} annotation.</p></article>`;
  }
  if (!service) {
    return `<article class="card missing"><h2>${escapeHtml(entity.name)}</h2><p>No portal service matches <code>${escapeHtml(path)}</code>.</p></article>`;
  }
  const rows = SEVERITIES.map(
    (severity) =>
      `<tr><th>${severity}</th><td>${service.severities[severity]}</td></tr>`,
  ).join("");
  return `<article class="card severity-${escapeHtml(highestSeverity(service))}" data-component="${escapeHtml(entity.name)}" data-path="${escapeHtml(service.path)}">
  <h2>${escapeHtml(entity.name)}</h2>
  <p class="desc">${escapeHtml(entity.description)}</p>
  <dl>
    <div><dt>Path</dt><dd><code>${escapeHtml(service.path)}</code></dd></div>
    <div><dt>Findings</dt><dd>${totalFindings(service)}</dd></div>
    <div><dt>Highest</dt><dd>${escapeHtml(highestSeverity(service))}</dd></div>
    <div><dt>Next end of life</dt><dd>${escapeHtml(service.nextEndOfLife ?? "—")}</dd></div>
    <div><dt>Report</dt><dd><a href="${escapeHtml(service.reportLink)}" rel="noopener noreferrer">${escapeHtml(service.reportLink)}</a></dd></div>
  </dl>
  <table><thead><tr><th>Severity</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>
</article>`;
}

/**
 * @param {string} body
 */
function page(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Evergreen Backstage sample — lifecycle risk</title>
  <link rel="stylesheet" href="/card.css" />
</head>
<body>
  <header>
    <p class="eyebrow">Evergreen · Backstage sample</p>
    <h1>Lifecycle risk per component</h1>
    <p>Each card is the same summary the Backstage entity card reads from the portal export. No scan runs here.</p>
  </header>
  <main class="grid">
${body}
  </main>
</body>
</html>
`;
}

async function build() {
  const catalog = await loadPortalCatalog(portalPath);
  const entities = parseSampleEntities(await readFile(entitiesPath, "utf8"));
  const cards = entities
    .map((entity) => {
      const path = entity.annotations[SERVICE_PATH_ANNOTATION];
      const service = path ? findService(catalog, path) : undefined;
      return renderCard(entity, service);
    })
    .join("\n");
  const html = page(cards);
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "preview.html"), html, "utf8");
  return { html, entities, catalog };
}

const css = `:root {
  color-scheme: light;
  --ink: #14201b;
  --muted: #4d5c55;
  --paper: #f4f7f5;
  --card: #ffffff;
  --line: #d5e0da;
  --critical: #9b1c1c;
  --high: #b45309;
  --medium: #a16207;
  --low: #1d4ed8;
  --info: #475569;
  --none: #15803d;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: linear-gradient(180deg, #e8f0eb, var(--paper)); color: var(--ink); }
header, main { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; color: var(--muted); margin: 0 0 0.5rem; }
h1 { margin: 0 0 0.5rem; font-size: 2rem; }
header p:last-child { color: var(--muted); max-width: 40rem; }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 1rem 1.1rem; box-shadow: 0 8px 24px rgb(20 32 27 / 6%); }
.card h2 { margin: 0 0 0.25rem; font-size: 1.15rem; }
.desc { margin: 0 0 0.75rem; color: var(--muted); font-size: 0.9rem; }
dl { display: grid; gap: 0.4rem; margin: 0 0 0.75rem; }
dl div { display: grid; grid-template-columns: 8.5rem 1fr; gap: 0.5rem; font-size: 0.9rem; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 0.3rem 0; border-top: 1px solid var(--line); }
.card.severity-critical { border-top: 4px solid var(--critical); }
.card.severity-high { border-top: 4px solid var(--high); }
.card.severity-medium { border-top: 4px solid var(--medium); }
.card.severity-low { border-top: 4px solid var(--low); }
.card.severity-info { border-top: 4px solid var(--info); }
.card.severity-none { border-top: 4px solid var(--none); }
.card.missing { opacity: 0.85; }
a { color: #0f766e; }
code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.85em; }
`;

const writeOnly = process.argv.includes("--write-only");
const { html, entities, catalog } = await build();

console.log(
  `Rendered ${entities.length} component cards from ${catalog.services.length} portal services → ${resolve(outDir, "preview.html")}`,
);

if (writeOnly) {
  process.exit(0);
}

const server = createServer(async (req, res) => {
  try {
    if (req.url === "/" || req.url === "/index.html" || req.url === "/preview.html") {
      const latest = await build();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(latest.html);
      return;
    }
    if (req.url === "/card.css") {
      res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      res.end(css);
      return;
    }
    if (req.url === "/api/evergreen/catalog") {
      const latest = await loadPortalCatalog(portalPath);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(latest));
      return;
    }
    if (req.url?.startsWith("/api/evergreen/services?")) {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const path = url.searchParams.get("path") ?? "";
      const latest = await loadPortalCatalog(portalPath);
      const match = findService(latest, path);
      if (!match) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: `no match for ${path}` }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(match));
      return;
    }
    res.writeHead(404).end("Not found");
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Evergreen Backstage sample listening on http://127.0.0.1:${port}/`);
});
