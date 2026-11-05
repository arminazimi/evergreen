// Reads a changelog supplied by the workflow from the release tag; no git or network calls.
// node release-notes.mjs vX.Y.Z <changelog-file> [--body]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function releaseSection(tag, changelog) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error(`Invalid release tag: ${tag}`);
  const version = tag.slice(1);
  const sections = changelog.replace(/\r\n/g, "\n").split(/^## /m);
  const section = sections.slice(1).find((text) => text.startsWith(`${version} - `));
  if (section === undefined) {
    if (version.includes("-")) return `Pre-release ${tag}. Release notes will follow with the stable release.`;
    throw new Error(`Missing changelog section for ${version}`);
  }
  const body = section.split("\n").slice(1).join("\n").trim();
  if (!body) throw new Error(`Empty changelog section for ${version}`);
  return body;
}

export function releaseBody(tag, changelog) {
  const section = releaseSection(tag, changelog);
  const base = `https://github.com/arminazimi/evergreen/blob/${tag}`;
  const heading = changelog.split(/\r?\n/).find((line) => line.startsWith(`## ${tag.slice(1)} - `));
  const anchor = heading ? `#${heading.slice(3).replace(/[^\w\s-]/g, "").replace(/ /g, "-").toLowerCase()}` : "";
  return `Install: \`npx evergreen-deprecation@${tag.slice(1)}\`; Action: \`arminazimi/evergreen@${tag}\`; verify binaries with \`sha256sum -c SHA256SUMS\` and [build attestations](${base}/docs/RELEASING.md#standalone-binaries).\n\n${section}\n\n[Changelog](${base}/CHANGELOG.md${anchor})\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [tag, file, mode] = process.argv.slice(2);
    if (!tag || !file || (mode !== undefined && mode !== "--body")) {
      throw new Error("Usage: release-notes.mjs vX.Y.Z <changelog-file> [--body]");
    }
    const changelog = readFileSync(file, "utf8");
    process.stdout.write(mode === "--body" ? releaseBody(tag, changelog) : `${releaseSection(tag, changelog)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
