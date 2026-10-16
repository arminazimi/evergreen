import { formatPurl } from "../../src/purl.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const GO_MODULE_DEPRECATION_URL = "https://go.dev/ref/mod#go-mod-file-module-deprecation";
const GO_MODULE_REFERENCE_URL = "https://go.dev/ref/mod";
const GO_PROXY = "https://proxy.golang.org";

/** Direct modules reviewed by this importer. Go has no endpoint that lists all deprecated modules. */
export const GO_MODULE_CANDIDATES: readonly string[] = [
  "cloud.google.com/go/pubsub",
  "github.com/cncf/udpa/go",
  "github.com/discord/lilliput",
  "github.com/golang/protobuf",
  "github.com/streadway/amqp",
  "go.opentelemetry.io/otel/exporters/zipkin",
];

const MODULE_PATH = /^[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9][a-z0-9._~-]*)+$/;
const VERSION = /^v[0-9][0-9A-Za-z.+-]*$/;
const MAX_MESSAGE = 280;

interface LatestVersion {
  Version?: unknown;
}

export const latestUrl = (module: string) => `${GO_PROXY}/${module}/@latest`;
export const goModUrl = (module: string, version: string) => `${GO_PROXY}/${module}/@v/${version}.mod`;

function deprecationMessage(goMod: string): string | undefined {
  const lines = goMod.replace(/\r\n?/g, "\n").split("\n");
  const moduleIndex = lines.findIndex((line) => /^\s*module\s+\S+/.test(line));
  if (moduleIndex < 0) return undefined;

  const comments: string[] = [];
  for (let index = moduleIndex - 1; index >= 0 && /^\s*\/\//.test(lines[index]!); index--) comments.unshift(lines[index]!);
  const inline = lines[moduleIndex]!.match(/^\s*module\s+\S+\s*\/\/(.*)$/)?.[1];
  if (inline !== undefined) comments.push(`//${inline}`);

  const paragraphs = comments
    .map((line) => line.replace(/^\s*\/\/\s?/, "").trim())
    .join("\n")
    .split(/\n\s*\n/);
  const paragraph = paragraphs.find((value) => value.startsWith("Deprecated:"));
  return paragraph?.slice("Deprecated:".length).replace(/\s+/g, " ").trim() || undefined;
}

function shortMessage(message: string): string {
  return message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 1).trimEnd()}…` : message;
}

function replacement(message: string): string | undefined {
  return message.match(/(?:use|using|consider using)\s+(?:the\s+)?["'`]?([a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9][a-z0-9._~-]*)+)/i)?.[1];
}

function purl(module: string): string {
  const parts = module.split("/");
  return formatPurl({ type: "golang", namespace: parts.slice(0, -1).join("/"), name: parts.at(-1)! });
}

function ruleSlug(module: string): string {
  return module.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
}

export const goModuleDeprecationImporter: Importer = {
  id: "go-2",
  ecosystem: "go",
  description: "Direct Go modules whose latest go.mod carries an official Deprecated comment",
  sources: [
    { title: "Go module deprecation reference", url: GO_MODULE_DEPRECATION_URL },
    { title: "Go module proxy", url: `${GO_PROXY}/` },
  ],

  async import(context) {
    const reference = await context.fetchText(GO_MODULE_REFERENCE_URL, { accept: "text/html" });
    if (!reference.includes("Deprecated:") || !reference.includes("module-deprecation")) {
      return { rules: [], notes: ["The Go module reference no longer describes module deprecation comments; no drafts were produced."] };
    }

    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const active: string[] = [];
    for (const module of [...new Set(GO_MODULE_CANDIDATES)].sort()) {
      if (!MODULE_PATH.test(module)) {
        notes.push(`Skipped ${module}: not a valid lowercase Go module path.`);
        continue;
      }
      const latest = await fetchJson<LatestVersion>(context, latestUrl(module));
      if (typeof latest.Version !== "string" || !VERSION.test(latest.Version)) {
        notes.push(`Skipped ${module}: @latest did not return a canonical version.`);
        continue;
      }
      const sourceUrl = goModUrl(module, latest.Version);
      const message = deprecationMessage(await context.fetchText(sourceUrl, { accept: "text/plain" }));
      if (!message) {
        active.push(module);
        continue;
      }
      const moveTo = replacement(message);
      rules.push({
        id: `go.module.${ruleSlug(module)}.deprecated`,
        ecosystem: "go",
        purl: purl(module),
        vers: "vers:golang/*",
        event: "deprecated",
        title: `${module} is deprecated`,
        summary: `The latest ${module} module declares: "${shortMessage(message)}"`,
        severity: "medium",
        ...(moveTo ? { replacement: moveTo } : {}),
        sources: [
          { title: `${module} ${latest.Version} go.mod`, url: sourceUrl },
          { title: "Go module deprecation reference", url: GO_MODULE_DEPRECATION_URL },
        ],
      });
    }
    if (active.length > 0) notes.push(`No Deprecated comment at @latest: ${active.join(", ")}.`);
    return { rules, notes };
  },
};
