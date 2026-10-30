// Generates one Open Graph preview image per lifecycle rule page (and a site default)
// from the brand social-preview template. Output: docs/assets/og/*.svg.
//
//   node dist/tools/build-og-images.js [--check]
//
// With --check nothing is written: the command exits 1 and names every file that differs
// from what the registry would produce. It reads registry/*.json and the brand template
// only and never uses the network.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RegistryV2Rule } from "../src/registry.js";
import { DEFAULT_OG_IMAGE_PATH, loadRegistries, ruleOgImagePath } from "./build-reference-pages.js";

export const OG_DIRECTORY = "docs/assets/og";
export const DEFAULT_OG_ID = "default";
export const BRAND_TEMPLATE = "brand/templates/social-preview-dark.svg";

const EVENT_LABELS: Record<RegistryV2Rule["event"], string> = {
  deprecated: "Deprecated",
  "end-of-support": "End of support",
  "end-of-life": "End of life",
  removed: "Removed",
  "scheduled-end-of-life": "Scheduled end of life",
};

export { ruleOgImagePath, DEFAULT_OG_IMAGE_PATH };

export interface GeneratedOgFile {
  /** Repository-relative path. */
  path: string;
  contents: string;
}

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

/** Approximate Inter advance width so titles wrap without a font engine. */
export function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)));
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let index = 0;
  while (index < words.length && lines.length < maxLines) {
    let current = words[index]!;
    index += 1;
    while (index < words.length) {
      const next = `${current} ${words[index]}`;
      if (next.length > maxChars) break;
      current = next;
      index += 1;
    }
    const lastLine = lines.length === maxLines - 1;
    const more = index < words.length && lastLine;
    if (current.length > maxChars) current = `${current.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
    else if (more) current = `${current.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
    lines.push(current);
    if (more) break;
  }
  return lines;
}

/** Shared chrome from brand/templates/social-preview-dark.svg: canvas, grid, frame, mark. */
function brandChrome(title: string, description: string): string[] {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" role="img" aria-labelledby="title desc">`,
    `<title id="title">${escape(title)}</title>`,
    `<desc id="desc">${escape(description)}</desc>`,
    `<defs>`,
    `<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">`,
    `<path d="M32 0H0V32" fill="none" stroke="#F3F6F4" stroke-opacity=".035"/>`,
    `</pattern>`,
    `<mask id="outer-notch"><rect width="256" height="256" fill="white"/><rect x="119" y="18" width="18" height="28" fill="black"/></mask>`,
    `<mask id="middle-notch"><rect width="256" height="256" fill="white"/><rect x="186" y="119" width="30" height="18" fill="black"/></mask>`,
    `<mask id="inner-notch"><rect width="256" height="256" fill="white"/><rect x="119" y="160" width="18" height="30" fill="black"/></mask>`,
    `</defs>`,
    `<rect width="1280" height="640" fill="#0C1110"/>`,
    `<rect width="1280" height="640" fill="url(#grid)"/>`,
    `<rect x="48" y="48" width="1184" height="544" rx="24" fill="none" stroke="#F3F6F4" stroke-opacity=".09"/>`,
    `<path d="M488 96V544" stroke="#F3F6F4" stroke-opacity=".12"/>`,
    `<g transform="translate(104 160) scale(1.25)" fill="none" stroke-width="18">`,
    `<circle cx="128" cy="128" r="96" stroke="#23423A" mask="url(#outer-notch)"/>`,
    `<circle cx="128" cy="128" r="70" stroke="#4C7C6D" mask="url(#middle-notch)"/>`,
    `<circle cx="128" cy="128" r="44" stroke="#9AC7B6" mask="url(#inner-notch)"/>`,
    `</g>`,
  ];
}

/** Site-wide default: the brand social-preview card (tagline + command). */
export function renderDefaultOgImage(): string {
  return [
    ...brandChrome("Evergreen", "Know what breaks next. Local-first deprecation intelligence for software repositories."),
    `<g font-family="Inter, Arial, sans-serif">`,
    `<text x="552" y="256" fill="#F3F6F4" font-size="68" font-weight="700" letter-spacing="7">EVERGREEN</text>`,
    `<text x="555" y="310" fill="#9AC7B6" font-size="27" font-weight="500">Know what breaks next.</text>`,
    `<text x="555" y="368" fill="#F3F6F4" fill-opacity=".72" font-size="18">Local-first deprecation intelligence</text>`,
    `<text x="555" y="395" fill="#F3F6F4" fill-opacity=".72" font-size="18">for software repositories.</text>`,
    `</g>`,
    `<g font-family="IBM Plex Mono, Menlo, monospace" font-size="13" letter-spacing="1.5">`,
    `<text x="80" y="86" fill="#9AC7B6">LIFECYCLE / 01</text>`,
    `<text x="1086" y="86" fill="#F3F6F4" fill-opacity=".5">LOCAL-FIRST</text>`,
    `<rect x="552" y="454" width="404" height="50" rx="10" fill="#17211E" stroke="#F3F6F4" stroke-opacity=".12"/>`,
    `<circle cx="578" cy="479" r="5" fill="#4C7C6D"/>`,
    `<text x="596" y="484" fill="#F3F6F4" fill-opacity=".82" letter-spacing="0">npx evergreen-deprecation scan .</text>`,
    `</g>`,
    `</svg>`,
    ``,
  ].join("\n");
}

/** One readable card per rule / answer page: status, title, ecosystem, and optional deadline. */
export function renderRuleOgImage(rule: RegistryV2Rule): string {
  const status = EVENT_LABELS[rule.event];
  const lines = wrapText(rule.title, 640, 36, 3);
  const titleStart = 250;
  const titleGap = 44;
  const metaY = titleStart + lines.length * titleGap + 28;
  const meta = rule.deadline ? `${rule.ecosystem} · ${rule.deadline}` : rule.ecosystem;
  const description = `${status}. ${rule.title}. ${meta}.`;
  return [
    ...brandChrome(rule.title, description),
    `<g font-family="IBM Plex Mono, Menlo, monospace" font-size="13" letter-spacing="1.5">`,
    `<text x="80" y="86" fill="#9AC7B6">LIFECYCLE / RULE</text>`,
    `<text x="1086" y="86" fill="#F3F6F4" fill-opacity=".5">LOCAL-FIRST</text>`,
    `</g>`,
    `<g font-family="Inter, Arial, sans-serif">`,
    `<text x="552" y="200" fill="#9AC7B6" font-size="22" font-weight="600">${escape(status)}</text>`,
    ...lines.map((line, index) => `<text x="552" y="${titleStart + index * titleGap}" fill="#F3F6F4" font-size="36" font-weight="700">${escape(line)}</text>`),
    `<text x="552" y="${metaY}" fill="#F3F6F4" fill-opacity=".72" font-size="20">${escape(meta)}</text>`,
    `<text x="552" y="500" fill="#9AC7B6" font-size="18" font-weight="500">evergreen</text>`,
    `</g>`,
    `</svg>`,
    ``,
  ].join("\n");
}

export function buildOgFiles(rules: readonly RegistryV2Rule[]): GeneratedOgFile[] {
  const files: GeneratedOgFile[] = [{ path: `${OG_DIRECTORY}/${DEFAULT_OG_ID}.svg`, contents: renderDefaultOgImage() }];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) throw new Error(`Rule id "${rule.id}" appears more than once.`);
    if (rule.id === DEFAULT_OG_ID) throw new Error(`Rule id "${DEFAULT_OG_ID}" collides with the default OG image.`);
    seen.add(rule.id);
    files.push({ path: `${OG_DIRECTORY}/${rule.id}.svg`, contents: renderRuleOgImage(rule) });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function loadRules(): Promise<RegistryV2Rule[]> {
  const rules: RegistryV2Rule[] = [];
  for (const registry of await loadRegistries()) rules.push(...registry.rules);
  return rules.sort((left, right) => left.id.localeCompare(right.id));
}

/** Files that differ from `files`, and generated images that no rule produces any more. */
export async function drift(files: readonly GeneratedOgFile[], root = "."): Promise<string[]> {
  const problems: string[] = [];
  for (const file of files) {
    const actual = await readFile(resolve(root, file.path), "utf8").catch(() => undefined);
    if (actual === undefined) problems.push(`missing: ${file.path}`);
    else if (actual !== file.contents) problems.push(`differs: ${file.path}`);
  }
  const expected = new Set(files.map((file) => file.path));
  for (const name of await readdir(resolve(root, OG_DIRECTORY)).catch(() => [] as string[])) {
    const path = `${OG_DIRECTORY}/${name}`;
    if (name.endsWith(".svg") && !expected.has(path)) problems.push(`stale: ${path}`);
  }
  return problems.sort();
}

export async function write(files: readonly GeneratedOgFile[], root = "."): Promise<void> {
  const expected = new Set(files.map((file) => file.path));
  await mkdir(resolve(root, OG_DIRECTORY), { recursive: true });
  for (const name of await readdir(resolve(root, OG_DIRECTORY)).catch(() => [] as string[])) {
    if (name.endsWith(".svg") && !expected.has(`${OG_DIRECTORY}/${name}`)) await rm(resolve(root, OG_DIRECTORY, name));
  }
  for (const file of files) await writeFile(resolve(root, file.path), file.contents);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  // Touch the brand template so a missing source fails loudly; the SVG is reconstructed in code
  // so every card stays deterministic and free of external font or image references.
  await readFile(resolve(BRAND_TEMPLATE), "utf8");
  const files = buildOgFiles(await loadRules());
  if (argv.includes("--check")) {
    const problems = await drift(files);
    if (problems.length === 0) return 0;
    console.error(`The OG images are out of date (${problems.length} files). Run \`npm run build:og-images\` and commit the result:`);
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
    if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
    return 1;
  }
  await write(files);
  console.log(`Wrote ${files.length} files in ${OG_DIRECTORY}/.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
